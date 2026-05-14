import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, X, FileText, Image as ImageIcon, Link as LinkIcon, AlertCircle, BookOpen, Info, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ── Must match server/models/Video.js enum exactly ──────────────────
const SUBJECT_OPTIONS = [
    { group: 'General', options: ['General'] },
    { group: 'STEM', options: ['Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology'] },
    { group: 'Computing', options: ['Programming', 'Computer Science', 'Artificial Intelligence', 'Data Science'] },
    { group: 'Engineering', options: ['Technology', 'Engineering'] },
    { group: 'Humanities', options: ['History', 'Geography', 'Social Studies', 'English', 'Literature', 'Language'] },
    { group: 'Commerce', options: ['Business', 'Economics', 'Commerce'] },
    { group: 'Creative', options: ['Design', 'Arts', 'Music'] },
    { group: 'Professional', options: ['Medical', 'Law', 'Psychology'] },
];

const Upload = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    
    // Upload States
    const [loading, setLoading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(''); // 'cloudinary', 'backend', 'success'
    const [uploadProgress, setUploadProgress] = useState(0);

    // Form States
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [subject, setSubject] = useState('General');
    const [uploadMode, setUploadMode] = useState('video'); // 'video' or 'link'

    // Video Mode
    const [videoFile, setVideoFile] = useState(null);
    const [videoDuration, setVideoDuration] = useState(0);

    // Link Mode
    const [externalLink, setExternalLink] = useState('');

    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [resources, setResources] = useState([]);
    
    const [error, setError] = useState('');
    const [warning, setWarning] = useState('This platform only accepts strictly educational content. Entertainment, gaming, and music will be rejected by our AI moderator.');

    const handleVideoFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validation
        if (file.size > 500 * 1024 * 1024) {
            return setError('Video size must be less than 500MB.');
        }
        if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
            return setError('Only MP4, WebM, and MOV formats are allowed.');
        }

        setVideoFile(file);
        setError('');

        // Get duration
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.onloadedmetadata = () => {
            window.URL.revokeObjectURL(vid.src);
            const dur = Math.round(vid.duration);
            if (dur < 60) {
                setError('Videos must be at least 60 seconds long (Shorts are not allowed).');
                setVideoFile(null);
            } else {
                setVideoDuration(dur);
            }
        };
        vid.src = window.URL.createObjectURL(file);
    };

    const handleThumbnailChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return setError('Thumbnail must be an image.');
        setThumbnailFile(file);
    };

    const handleResourceChange = (e) => {
        const files = Array.from(e.target.files);
        const validFiles = files.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf') || f.name.endsWith('.doc') || f.name.endsWith('.docx'));
        if (validFiles.length !== files.length) {
            setError('Some resources were ignored. Only PDF/DOC files are allowed.');
        }
        setResources(prev => [...prev, ...validFiles]);
    };

    const removeResource = (index) => {
        setResources(prev => prev.filter((_, i) => i !== index));
    };

    const uploadToCloudinaryDirectly = async (file, folder) => {
        try {
            // 1. Get Signature from backend
            const sigRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/videos/upload-signature${folder === 'ezyedutube/videos' ? '' : '/' + folder.split('/')[1]}`);
            const { timestamp, signature, cloudName, apiKey } = sigRes.data;

            // 2. Upload directly to Cloudinary
            const formData = new FormData();
            formData.append('file', file);
            formData.append('api_key', apiKey);
            formData.append('timestamp', timestamp);
            formData.append('signature', signature);
            formData.append('folder', folder);
            
            // Eager transformations for optimization
            if (folder.includes('videos')) {
                formData.append('eager', 'q_auto,f_auto,vc_h264');
                formData.append('eager_async', 'true');
            }

            const resourceType = folder.includes('videos') ? 'video' : folder.includes('thumbnails') ? 'image' : 'raw';

            const res = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, formData, {
                onUploadProgress: (progressEvent) => {
                    if (folder.includes('videos')) {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setUploadProgress(percentCompleted);
                    }
                }
            });

            return res.data.secure_url;
        } catch (err) {
            console.error("Cloudinary upload error:", err);
            throw new Error('Failed to upload file to Cloudinary. Please check your network and try again.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setUploadProgress(0);

        if (!title) return setError('Title is required');
        if (uploadMode === 'video' && !videoFile) return setError('Please select a video file.');
        if (uploadMode === 'link' && !externalLink) return setError('Please enter a valid educational link.');

        setLoading(true);
        setUploadStatus('cloudinary');

        try {
            let videoUrl = '';
            let thumbnailUrl = '';
            let resourcesUrls = [];

            // 1. Upload assets to Cloudinary directly from frontend
            if (uploadMode === 'video') {
                videoUrl = await uploadToCloudinaryDirectly(videoFile, 'ezyedutube/videos');
                if (!videoUrl) throw new Error("Cloudinary did not return a valid video URL.");
            }
            if (thumbnailFile) {
                thumbnailUrl = await uploadToCloudinaryDirectly(thumbnailFile, 'ezyedutube/thumbnails');
            }
            if (resources.length > 0) {
                for (const resFile of resources) {
                    const url = await uploadToCloudinaryDirectly(resFile, 'ezyedutube/documents');
                    resourcesUrls.push(url);
                }
            }

            // 2. Send metadata to our backend for AI Moderation & DB Saving
            setUploadStatus('backend');
            setUploadProgress(100); 
            
            // Send as FormData so multer intercepts and parses req.body correctly
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', description);
            formData.append('subject', subject);
            formData.append('isExternal', uploadMode === 'link' ? 'true' : 'false');
            
            if (uploadMode === 'link') {
                formData.append('externalLink', externalLink);
            } else {
                formData.append('videoUrl', videoUrl);
            }

            formData.append('thumbnailUrl', thumbnailUrl);
            formData.append('resourcesUrls', JSON.stringify(resourcesUrls));
            formData.append('duration', videoDuration);

            await axios.post(`${import.meta.env.VITE_API_URL}/api/videos/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            setUploadStatus('success');
            setTimeout(() => {
                navigate('/');
            }, 3000);

        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || err.message || 'Upload failed. Please try again.');
            setLoading(false);
            setUploadStatus('');
            setUploadProgress(0);
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-10 animation-fade-in">
            <h1 className="text-3xl font-bold mb-8 text-zinc-900 dark:text-white flex items-center gap-2">
                <UploadIcon className="text-red-600" />
                Upload Educational Content
            </h1>

            {warning && (
                <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-700 dark:text-yellow-400 p-4 rounded-xl mb-6 flex items-start gap-3">
                    <Info size={24} className="mt-0.5 flex-shrink-0" />
                    <p className="text-sm font-medium">{warning}</p>
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-600 p-4 rounded-xl mb-6 flex items-center gap-2">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}
            
            {uploadStatus === 'success' && (
                <div className="bg-green-500/10 border border-green-500 text-green-600 p-4 rounded-xl mb-6 flex items-center gap-2">
                    <CheckCircle2 size={20} />
                    Video submitted successfully! It is now pending AI moderation.
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Title & Desc */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Title</label>
                        <input
                            type="text"
                            className="w-full p-3 rounded-lg border bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-700 focus:ring-2 focus:ring-red-500 outline-none transition disabled:opacity-50"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            required
                            disabled={loading}
                            placeholder="e.g. Introduction to Data Science"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <textarea
                            className="w-full p-3 rounded-lg border bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-700 h-28 focus:ring-2 focus:ring-red-500 outline-none transition resize-none disabled:opacity-50"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            disabled={loading}
                            placeholder="Describe your content in detail. This helps our AI verify its educational value."
                        />
                    </div>
                </div>

                {/* Subject / Stream Picker */}
                <div>
                    <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                        <BookOpen size={15} className="text-orange-500" />
                        Subject / Stream
                    </label>
                    <select
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        disabled={loading}
                        className="w-full p-3 rounded-lg border bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-700 focus:ring-2 focus:ring-orange-400 outline-none transition text-sm cursor-pointer disabled:opacity-50"
                    >
                        {SUBJECT_OPTIONS.map(({ group, options }) => (
                            <optgroup key={group} label={`── ${group} ──`}>
                                {options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>

                {/* Content Type Toggle */}
                <div>
                    <label className="block text-sm font-medium mb-3">Content Source</label>
                    <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg w-fit">
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => setUploadMode('video')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${uploadMode === 'video' ? 'bg-white dark:bg-zinc-600 shadow text-black dark:text-white' : 'text-zinc-500'} disabled:opacity-50`}
                        >
                            Upload Video
                        </button>
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => setUploadMode('link')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${uploadMode === 'link' ? 'bg-white dark:bg-zinc-600 shadow text-black dark:text-white' : 'text-zinc-500'} disabled:opacity-50`}
                        >
                            External Link
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {uploadMode === 'video' ? (
                        <div className={`border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 text-center transition relative group ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}>
                            <UploadIcon className="mx-auto h-8 w-8 text-red-500 mb-2 transition-transform group-hover:-translate-y-1" />
                            <label className={`block text-sm font-medium ${loading ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                <span className="text-red-500 font-bold hover:underline">Choose Video File</span>
                                <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden disabled={loading} onChange={handleVideoFileChange} />
                            </label>
                            {videoFile ? (
                                <p className="text-xs mt-2 text-green-600 font-medium truncate bg-green-100 dark:bg-green-900/30 py-1 px-2 rounded">{videoFile.name} ({videoDuration}s)</p>
                            ) : (
                                <p className="text-xs text-zinc-400 mt-2">MP4, WebM, MOV. Min 60s. Max 500MB.</p>
                            )}
                        </div>
                    ) : (
                        <div className={`border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 transition ${loading ? 'opacity-50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}>
                            <LinkIcon className="mx-auto h-8 w-8 text-blue-500 mb-2" />
                            <label className="block text-sm font-medium mb-1">External Educational Link</label>
                            <input
                                type="url"
                                placeholder="https://youtube.com/watch?v=..."
                                className="w-full p-2 bg-transparent border-b border-zinc-300 dark:border-zinc-600 focus:border-blue-500 outline-none text-center text-sm"
                                value={externalLink}
                                disabled={loading}
                                onChange={e => setExternalLink(e.target.value)}
                            />
                            <p className="text-xs text-zinc-400 mt-2 text-center">YouTube, Vimeo, Coursera only.</p>
                        </div>
                    )}

                    {/* Thumbnail Upload */}
                    <div className={`border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 text-center transition relative group ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}>
                        <ImageIcon className="mx-auto h-8 w-8 text-purple-500 mb-2 transition-transform group-hover:-translate-y-1" />
                        <label className={`block text-sm font-medium ${loading ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <span className="text-purple-500 font-bold hover:underline">Upload Thumbnail</span>
                            <input type="file" accept="image/*" hidden disabled={loading} onChange={handleThumbnailChange} />
                        </label>
                        {thumbnailFile ? (
                            <p className="text-xs mt-2 text-green-600 font-medium truncate bg-green-100 dark:bg-green-900/30 py-1 px-2 rounded">{thumbnailFile.name}</p>
                        ) : (
                            <p className="text-xs text-zinc-400 mt-2">JPG, PNG (Optional)</p>
                        )}
                    </div>
                </div>

                {/* Resources */}
                <div className={loading ? 'opacity-50 pointer-events-none' : ''}>
                    <label className="block text-sm font-medium mb-2">Practice Material (PDF/DOC)</label>
                    <div className="flex items-center gap-4 mb-4">
                        <label className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg cursor-pointer text-sm font-medium hover:opacity-80 transition flex items-center gap-2">
                            <FileText size={16} />
                            Attach Files
                            <input type="file" multiple accept=".pdf,.doc,.docx" hidden disabled={loading} onChange={handleResourceChange} />
                        </label>
                    </div>
                    <div className="space-y-2">
                        {resources.map((file, i) => (
                            <div key={i} className="flex items-center justify-between p-3 border rounded-lg dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
                                <div className="flex items-center gap-3">
                                    <FileText size={18} className="text-orange-500" />
                                    <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                                </div>
                                <button type="button" onClick={() => removeResource(i)} className="text-zinc-400 hover:text-red-500">
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Submit & Progress */}
                <div className="pt-4">
                    {loading && uploadStatus === 'cloudinary' && uploadMode === 'video' && (
                        <div className="mb-4">
                            <div className="flex justify-between text-xs text-zinc-500 mb-1">
                                <span>Uploading to Cloudinary...</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                                <div className="bg-red-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                            </div>
                        </div>
                    )}
                    
                    {loading && uploadStatus === 'backend' && (
                        <div className="mb-4 text-center text-sm font-medium text-orange-500 animate-pulse">
                            AI moderation in progress...
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || uploadStatus === 'success'}
                        className="w-full py-3 bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-90 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                {uploadStatus === 'cloudinary' ? 'Uploading...' : 'Verifying...'}
                            </>
                        ) : 'Publish to EzyEduTube'}
                    </button>
                    <p className="text-center text-xs text-zinc-400 mt-4">By publishing, you agree to our strict educational content policy.</p>
                </div>

            </form>
        </div>
    );
};

export default Upload;
