import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, Download, ThumbsUp, Eye, Trash2,
    BookOpen, Play, Clock, ChevronRight,
    Bell, BellOff, Share2, Check, Link2,
    Users, Heart, X, MessageCircle, Mail,
    Facebook, Twitter
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildEmbedUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    if (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be')) {
        let videoId = '';
        try {
            const url = new URL(rawUrl);
            videoId = url.searchParams.get('v') || url.pathname.split('/').pop();
            if (videoId?.includes('&')) videoId = videoId.split('&')[0];
        } catch {
            videoId = rawUrl.split('v=')[1]?.split('&')[0] || rawUrl.split('/').pop();
        }
        return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&showinfo=0&iv_load_policy=3&fs=1&color=white`;
    }
    return rawUrl;
}

function fmtCount(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n ?? 0);
}

function fmtDuration(s) {
    if (!s) return '';
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ─── Share Platforms ──────────────────────────────────────────────────────────
const SHARE_PLATFORMS = (url, title) => [
    {
        key: 'whatsapp',
        label: 'WhatsApp',
        color: '#25D366',
        bg: '#dcfce7',
        darkBg: 'rgba(22,101,52,0.25)',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
        ),
        href: `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`,
    },
    {
        key: 'twitter',
        label: 'X (Twitter)',
        color: '#000000',
        bg: '#f1f5f9',
        darkBg: 'rgba(15,23,42,0.5)',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        ),
        href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    },
    {
        key: 'facebook',
        label: 'Facebook',
        color: '#1877F2',
        bg: '#dbeafe',
        darkBg: 'rgba(30,58,138,0.25)',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
        ),
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
        key: 'linkedin',
        label: 'LinkedIn',
        color: '#0A66C2',
        bg: '#dbeafe',
        darkBg: 'rgba(7,89,133,0.25)',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
        ),
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    },
    {
        key: 'email',
        label: 'Email',
        color: '#EA4335',
        bg: '#fee2e2',
        darkBg: 'rgba(127,29,29,0.25)',
        icon: <Mail className="w-5 h-5" />,
        href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`Check out this educational video: ${url}`)}`,
    },
];

// ─── Share Modal ──────────────────────────────────────────────────────────────
const ShareModal = ({ isOpen, onClose, videoId, videoTitle, onShared }) => {
    const [copied, setCopied] = useState(false);
    const shareUrl = `${window.location.origin}/resource/${videoId}`;
    const platforms = SHARE_PLATFORMS(shareUrl, videoTitle);

    const handlePlatformShare = async (platform) => {
        window.open(platform.href, '_blank', 'width=600,height=500,noopener,noreferrer');
        // Track share
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/videos/${videoId}/share`);
            onShared(res.data.shares);
        } catch { }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
        } catch {
            const el = document.createElement('textarea');
            el.value = shareUrl;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        // Track share
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/videos/${videoId}/share`);
            onShared(res.data.shares);
        } catch { }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.88, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.88, y: 30 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
                                   w-[92vw] max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl
                                   border border-zinc-200 dark:border-zinc-700 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center gap-2">
                                <Share2 size={18} className="text-orange-500" />
                                <h2 className="font-bold text-zinc-900 dark:text-white">Share this video</h2>
                            </div>
                            <button onClick={onClose}
                                className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-400 hover:text-zinc-700 dark:hover:text-white">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 space-y-5">
                            {/* Title preview */}
                            <p className="text-xs text-zinc-500 line-clamp-1 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-100 dark:border-zinc-700 font-medium">
                                🎓 {videoTitle}
                            </p>

                            {/* Platforms grid */}
                            <div className="grid grid-cols-5 gap-3">
                                {platforms.map(p => (
                                    <button
                                        key={p.key}
                                        onClick={() => handlePlatformShare(p)}
                                        className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition hover:scale-110 active:scale-95"
                                        style={{ color: p.color }}
                                        title={`Share on ${p.label}`}
                                    >
                                        <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-sm"
                                            style={{ background: `var(--share-bg, ${p.bg})` }}>
                                            {p.icon}
                                        </div>
                                        <span className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 text-center leading-tight">
                                            {p.label}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Divider */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                                <span className="text-xs text-zinc-400 font-medium">or copy link</span>
                                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                            </div>

                            {/* Copy link row */}
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 overflow-hidden">
                                    <Link2 size={14} className="text-zinc-400 flex-shrink-0" />
                                    <span className="text-xs text-zinc-500 truncate font-mono flex-1">{shareUrl}</span>
                                </div>
                                <motion.button
                                    onClick={handleCopy}
                                    whileTap={{ scale: 0.9 }}
                                    className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
                                        ${copied
                                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-200 dark:shadow-green-900/30'
                                            : 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow hover:opacity-90'
                                        }`}
                                >
                                    {copied ? <><Check size={15} /> Copied!</> : <><Link2 size={15} /> Copy</>}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

// ─── Related video card ───────────────────────────────────────────────────────
const RelatedCard = ({ video }) => (
    <Link to={`/resource/${video._id}`}>
        <motion.div whileHover={{ x: 3 }}
            className="flex gap-3 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition group cursor-pointer">
            <div className="relative w-28 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-200 dark:bg-zinc-700">
                {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30">
                        <Play size={18} className="text-orange-400" />
                    </div>
                )}
                {video.duration > 0 && (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 py-0.5 rounded">
                        {fmtDuration(video.duration)}
                    </span>
                )}
                <span className={`absolute top-1 left-1 text-[8px] font-bold px-1 py-0.5 rounded uppercase
                    ${video.sourceType === 'external' ? 'bg-blue-500/90 text-white' : 'bg-orange-500/90 text-white'}`}>
                    {video.sourceType === 'external' ? 'Link' : 'Upload'}
                </span>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">{video.title}</p>
                <p className="text-[10px] text-zinc-500 mt-1 truncate">{video.uploader?.username || 'Unknown'}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
                    <span className="flex items-center gap-0.5"><Eye size={9} /> {fmtCount(video.views)}</span>
                    {video.subject && (
                        <span className="px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-500 font-medium">
                            {video.subject}
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    </Link>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
const ResourceDetail = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [videoData, setVideoData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState([]);
    const [deletingCommentId, setDeletingCommentId] = useState(null);
    const [allVideos, setAllVideos] = useState([]);

    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [liking, setLiking] = useState(false);

    const [subscribed, setSubscribed] = useState(false);
    const [subCount, setSubCount] = useState(0);
    const [subscribing, setSubscribing] = useState(false);

    const [viewCount, setViewCount] = useState(0);
    const [shareCount, setShareCount] = useState(0);
    const [showShare, setShowShare] = useState(false);

    // Fetch current video
    useEffect(() => {
        let cancelled = false;
        const fetchVideo = async () => {
            try {
                const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/videos/${id}`);
                if (cancelled) return;
                const v = res.data.video;
                setVideoData(v);
                setComments(res.data.comments);
                setLikeCount(v.likes?.length ?? 0);
                setShareCount(v.shares ?? 0);
                setViewCount(v.views ?? 0);
                if (user && v.likes) setLiked(v.likes.includes(user._id));

                // Fetch uploader for subscriber count + subscription state
                if (v.uploader?._id) {
                    const uploaderRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/auth/user/${v.uploader._id}`).catch(() => null);
                    if (!cancelled && uploaderRes) {
                        const u = uploaderRes.data;
                        setSubCount(u.subscribers?.length ?? 0);
                        if (user) {
                            setSubscribed((u.subscribers || []).map(s => s.toString()).includes(user._id));
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to load video', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchVideo();
        return () => { cancelled = true; };
    }, [id, user]);

    // Increment view once
    useEffect(() => {
        if (!id) return;
        axios.post(`${import.meta.env.VITE_API_URL}/api/videos/${id}/view`)
            .then(res => setViewCount(res.data.views))
            .catch(() => { });
    }, [id]);

    // Fetch all videos for recommendations
    useEffect(() => {
        axios.get(`${import.meta.env.VITE_API_URL}/api/videos`).then(res => setAllVideos(res.data)).catch(() => { });
    }, []);

    const recommended = useMemo(() => {
        if (!videoData || !allVideos.length) return [];
        const safeAllVideos = Array.isArray(allVideos) ? allVideos : [];
        const others = safeAllVideos.filter(v => v._id !== videoData._id);
        const sameSubject = others.filter(v => v.subject && v.subject === videoData.subject);
        const sameUploader = others.filter(v =>
            v.uploader?._id === videoData.uploader?._id && !sameSubject.find(s => s._id === v._id)
        );
        const rest = others.filter(v =>
            !sameSubject.find(s => s._id === v._id) && !sameUploader.find(s => s._id === v._id)
        );
        return [...sameSubject.slice(0, 4), ...sameUploader.slice(0, 2), ...rest.slice(0, 4)].slice(0, 10);
    }, [videoData, allVideos]);

    // Watch history
    useEffect(() => {
        if (!videoData) return;
        const entry = { id: videoData._id, title: videoData.title, thumbnail: videoData.thumbnailUrl, uploader: videoData.uploader?.username, watchedAt: new Date().toISOString() };
        const prev = JSON.parse(localStorage.getItem('ezyedutube_history') || '[]');
        const safePrev = Array.isArray(prev) ? prev : [];
        localStorage.setItem('ezyedutube_history', JSON.stringify([entry, ...safePrev.filter(h => h.id !== videoData._id)].slice(0, 50)));
    }, [videoData]);

    const handleLike = useCallback(async () => {
        if (!user || liking) return;
        const loggedInUserId = user._id || user.id;

        // Optimistic UI updates
        const nextLiked = !liked;
        const nextLikeCount = liked ? Math.max(0, likeCount - 1) : likeCount + 1;
        
        setLiked(nextLiked);
        setLikeCount(nextLikeCount);
        setLiking(true);

        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/videos/${id}/like`, { userId: loggedInUserId });
            const backendLikes = res.data.likes;
            if (Array.isArray(backendLikes)) {
                setLiked(backendLikes.includes(loggedInUserId));
                setLikeCount(backendLikes.length);
            } else {
                setLiked(res.data.liked);
                setLikeCount(res.data.likes);
            }
        } catch (err) {
            // Rollback on failure
            setLiked(liked);
            setLikeCount(likeCount);
            console.error('Like error:', err);
        } finally {
            setLiking(false);
        }
    }, [id, user, liked, likeCount, liking]);

    const handleSubscribe = useCallback(async () => {
        if (!user || subscribing) return;
        const loggedInUserId = user._id || user.id;

        // Optimistic UI updates
        const nextSubscribed = !subscribed;
        const nextSubCount = subscribed ? Math.max(0, subCount - 1) : subCount + 1;

        setSubscribed(nextSubscribed);
        setSubCount(nextSubCount);
        setSubscribing(true);

        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/videos/${id}/subscribe`, { userId: loggedInUserId });
            const backendSubscribers = res.data.subscribers;
            if (Array.isArray(backendSubscribers)) {
                setSubscribed(backendSubscribers.includes(loggedInUserId));
                setSubCount(backendSubscribers.length);
            } else {
                setSubscribed(res.data.subscribed);
                setSubCount(res.data.subscribers);
            }
        } catch (err) {
            // Rollback on failure
            setSubscribed(subscribed);
            setSubCount(subCount);
            console.error('Subscribe error:', err);
        } finally {
            setSubscribing(false);
        }
    }, [id, user, subscribed, subCount, subscribing]);

    const handleComment = async (e) => {
        e.preventDefault();
        if (!comment.trim() || !user) return;
        const loggedInUserId = user._id || user.id;
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/videos/${id}/comments`, { userId: loggedInUserId, content: comment });
            setComments(prev => [res.data, ...(Array.isArray(prev) ? prev : [])]);
            setComment('');
        } catch (err) {
            console.error('Comment error:', err);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!window.confirm('Delete this comment?')) return;
        setDeletingCommentId(commentId);
        try {
            await axios.delete(`${import.meta.env.VITE_API_URL}/api/videos/comments/${commentId}`);
            setComments(prev => (Array.isArray(prev) ? prev : []).filter(c => c.id !== commentId && c._id !== commentId));
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to delete comment');
        } finally {
            setDeletingCommentId(null);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Delete this video?')) return;
        try {
            const endpoint = (user.role === 'admin') 
                ? `${import.meta.env.VITE_API_URL}/api/videos/${id}`
                : `${import.meta.env.VITE_API_URL}/api/videos/my-video/${id}`;
            await axios.delete(endpoint);
            navigate('/');
        } catch { alert('Failed to delete'); }
    };

    if (loading) return (
        <div className="flex flex-col justify-center items-center h-[60vh] gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center animate-pulse">
                <BookOpen size={20} className="text-white" />
            </div>
            <p className="text-sm text-zinc-400 animate-pulse">Loading…</p>
        </div>
    );
    if (!videoData) return <div className="text-center mt-20 text-zinc-500">Video not found</div>;

    const isOwner = user && videoData.uploader && (user._id === videoData.uploader._id || user._id === videoData.uploader.id || user.id === videoData.uploader.id);
    const canDelete = user && (user.role === 'admin' || isOwner);

    const VideoPlayer = () => {
        const url = videoData.videoUrl || '';

        // Auto-detect external/YouTube even if sourceType is wrong
        const isExternal = videoData.sourceType === 'external'
            || url.includes('youtube.com')
            || url.includes('youtu.be')
            || url.includes('vimeo.com')
            || url.includes('coursera.org');

        if (isExternal) {
            return (
                <iframe src={buildEmbedUrl(url)} className="w-full h-full" allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    title={videoData.title} referrerPolicy="strict-origin-when-cross-origin" />
            );
        }

        if (!url) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 gap-2">
                    <Play size={48} className="opacity-30" />
                    <p className="text-sm">Video file not available</p>
                </div>
            );
        }

        return (
            <video src={url} controls className="w-full h-full" poster={videoData.thumbnailUrl} controlsList="nodownload">
                Your browser does not support video.
            </video>
        );
    };


    return (
        <>
            {/* Share Modal — rendered at top level */}
            <ShareModal
                isOpen={showShare}
                onClose={() => setShowShare(false)}
                videoId={id}
                videoTitle={videoData.title}
                onShared={(count) => setShareCount(count)}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Left: Player + Info ──────────────────────────────── */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Player */}
                    <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
                        <VideoPlayer />
                    </div>

                    {/* Title */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <h1 className="text-xl font-bold text-zinc-900 dark:text-white leading-snug">{videoData.title}</h1>
                            {videoData.subject && (
                                <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                                    <BookOpen size={10} /> {videoData.subject}
                                </span>
                            )}
                        </div>
                        {canDelete && (
                            <button onClick={handleDelete}
                                className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition flex-shrink-0" title="Delete">
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>

                    {/* ── Stats Row ──────────────────────────────────────── */}
                    <div className="flex items-center gap-3 flex-wrap text-sm text-zinc-500">
                        <span className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full">
                            <Eye size={14} />
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{fmtCount(viewCount)}</span> views
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Clock size={13} />
                            {formatDistanceToNow(new Date(videoData.createdAt), { addSuffix: true })}
                        </span>
                    </div>

                    {/* ── Action Bar ─────────────────────────────────────── */}
                    <div className="flex items-center gap-2 flex-wrap">

                        {/* Like */}
                        <motion.button
                            onClick={handleLike}
                            disabled={!user || liking}
                            whileTap={{ scale: 0.88 }}
                            title={user ? (liked ? 'Unlike' : 'Like') : 'Login to like'}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm transition-all border
                                ${liked
                                    ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white border-transparent shadow-md'
                                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-red-300 hover:text-red-500'
                                } disabled:opacity-50`}
                        >
                            {liking ? (
                                <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                            ) : (
                                <AnimatePresence mode="wait">
                                    <motion.span key={liked ? 'h' : 'u'}
                                        initial={{ scale: 0.6, rotate: -15 }} animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: 'spring', stiffness: 400 }}>
                                        {liked ? <Heart size={16} fill="currentColor" /> : <ThumbsUp size={16} />}
                                    </motion.span>
                                </AnimatePresence>
                            )}
                            <span>{fmtCount(likeCount)}</span>
                            <span className="hidden sm:inline">{liked ? 'Liked' : 'Like'}</span>
                        </motion.button>

                        {/* Share */}
                        <motion.button
                            onClick={() => setShowShare(true)}
                            whileTap={{ scale: 0.88 }}
                            className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:border-blue-300 hover:text-blue-500 transition-all"
                        >
                            <Share2 size={16} />
                            <span>{fmtCount(shareCount)}</span>
                            <span className="hidden sm:inline">Share</span>
                        </motion.button>
                    </div>

                    {/* ── Uploader Card + Subscribe ──────────────────────── */}
                    <div className="flex items-center justify-between gap-4 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-base shadow">
                                {videoData.uploader?.username?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div>
                                <p className="font-bold text-sm text-zinc-900 dark:text-white">{videoData.uploader?.username || 'Unknown'}</p>
                                <p className="text-xs text-zinc-400 flex items-center gap-1">
                                    <Users size={11} /> {fmtCount(subCount)} subscriber{subCount !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>

                        {/* Subscribe button — always visible */}
                        {isOwner ? (
                            // Owner sees their own channel badge
                            <div className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
                                <Users size={13} /> Your Channel
                            </div>
                        ) : !user ? (
                            // Not logged in
                            <Link to="/login">
                                <button className="flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-md hover:opacity-90 transition">
                                    <Bell size={14} /> Subscribe
                                </button>
                            </Link>
                        ) : (
                            // Logged in, can subscribe
                            <motion.button
                                onClick={handleSubscribe}
                                disabled={subscribing}
                                whileTap={{ scale: 0.92 }}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-md
                                    ${subscribed
                                        ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 border border-zinc-300 dark:border-zinc-600'
                                        : 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-red-200 dark:shadow-red-900/30 hover:opacity-90'
                                    } disabled:opacity-60`}
                            >
                                {subscribing ? (
                                    <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                                ) : subscribed ? (
                                    <><BellOff size={14} /> Subscribed</>
                                ) : (
                                    <><Bell size={14} /> Subscribe</>
                                )}
                            </motion.button>
                        )}
                    </div>

                    {/* Description */}
                    {videoData.description && (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                            <p className="text-zinc-700 dark:text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">{videoData.description}</p>
                        </div>
                    )}

                    {/* Resources */}
                    {videoData.resources?.length > 0 && (
                        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                            <h3 className="font-bold mb-3 flex items-center gap-2 text-sm">
                                <FileText size={15} className="text-red-500" /> Practice Materials
                            </h3>
                            <div className="space-y-2">
                                {(Array.isArray(videoData.resources) ? videoData.resources : []).map((res, i) => (
                                    <a key={i} href={res.url} target="_blank" rel="noreferrer"
                                        className="flex items-center justify-between p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition group">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <FileText size={15} className="text-zinc-500 flex-shrink-0" />
                                            <span className="text-sm truncate font-medium">{res.title}</span>
                                        </div>
                                        <Download size={13} className="text-zinc-400 group-hover:text-black dark:group-hover:text-white flex-shrink-0" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Comments */}
                    <div className="pt-2">
                        <h3 className="text-lg font-bold mb-4">{(Array.isArray(comments) ? comments : []).length} Comment{(Array.isArray(comments) ? comments : []).length !== 1 ? 's' : ''}</h3>
                        {user ? (
                            <form onSubmit={handleComment} className="flex gap-3 mb-8">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                    {user.username?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <input type="text"
                                        className="w-full border-b border-zinc-200 dark:border-zinc-700 bg-transparent py-2 focus:border-orange-400 focus:outline-none transition text-sm"
                                        placeholder="Add a comment or question..."
                                        value={comment} onChange={e => setComment(e.target.value)} />
                                    <div className="flex justify-end mt-2">
                                        <button type="submit" disabled={!comment.trim()}
                                            className="px-4 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition">
                                            Post
                                        </button>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            <p className="mb-8 text-sm text-zinc-500">
                                <Link to="/login" className="text-orange-500 underline font-medium">Login</Link> to leave a comment.
                            </p>
                        )}
                        <div className="space-y-5">
                            {(Array.isArray(comments) ? comments : []).map(c => {
                                const loggedInUserId = user?._id || user?.id;
                                const isCommentOwner = user && (c.userId === loggedInUserId || (c.user && (c.user.id === loggedInUserId || c.user._id === loggedInUserId)));
                                const isVideoOwner = user && videoData.uploader && (videoData.uploader.id === loggedInUserId || videoData.uploader._id === loggedInUserId || videoData.uploaderId === loggedInUserId);
                                const canDeleteComment = isCommentOwner || isVideoOwner;
                                const commentId = c.id || c._id;

                                return (
                                    <div key={commentId} className="flex gap-3 justify-between items-start group/comment">
                                        <div className="flex gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                {c.user?.username?.[0]?.toUpperCase() || 'U'}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">{c.user?.username || 'User'}</span>
                                                    <span className="text-[10px] text-zinc-400">
                                                        {c.createdAt ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }) : 'just now'}
                                                    </span>
                                                </div>
                                                <p className="text-zinc-700 dark:text-zinc-300 text-sm break-words whitespace-pre-wrap">{c.content}</p>
                                            </div>
                                        </div>
                                        {canDeleteComment && (
                                            <button 
                                                onClick={() => handleDeleteComment(commentId)}
                                                disabled={deletingCommentId === commentId}
                                                className="text-zinc-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition opacity-0 group-hover/comment:opacity-100 disabled:opacity-50 flex-shrink-0"
                                                title="Delete comment"
                                            >
                                                {deletingCommentId === commentId ? (
                                                    <div className="w-3.5 h-3.5 border border-zinc-400 border-t-red-500 rounded-full animate-spin" />
                                                ) : (
                                                    <Trash2 size={14} />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Right: Recommendations ────────────────────────────── */}
                <div className="space-y-5">
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                            <h3 className="font-bold text-sm flex items-center gap-2">
                                <Play size={14} className="text-orange-500" /> Up Next on EzyEduTube
                            </h3>
                            {videoData.subject && (
                                <span className="text-[10px] text-orange-500 font-semibold px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20">
                                    {videoData.subject}
                                </span>
                            )}
                        </div>
                        <div className="p-2">
                            {(Array.isArray(recommended) ? recommended : []).length === 0 ? (
                                <div className="py-8 text-center space-y-2">
                                    <div className="text-3xl">🎓</div>
                                    <p className="text-xs text-zinc-400">No other videos yet.</p>
                                    {user && <Link to="/upload"><span className="text-xs text-orange-500 hover:underline font-medium">Be the first to upload!</span></Link>}
                                </div>
                            ) : (
                                <div className="space-y-0.5">
                                    {(Array.isArray(recommended) ? recommended : []).map((video, i) => (
                                        <motion.div key={video._id}
                                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}>
                                            <RelatedCard video={video} />
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-2.5">
                            <Link to="/" className="flex items-center justify-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-semibold transition">
                                Browse all videos <ChevronRight size={12} />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ResourceDetail;
