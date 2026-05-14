import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import VideoCard from '../components/VideoCard';
import { Loader2, TrendingUp, Clock, Star, Sparkles, BookOpen, Search, X } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ── Category chips – must align with Video model subject enum ──────────────
const STREAMS = [
    { label: 'All', emoji: '🌟', match: [] },
    // STEM
    { label: 'Mathematics', emoji: '📐', match: ['mathematics'] },
    { label: 'Science', emoji: '🔬', match: ['science', 'physics', 'chemistry', 'biology'] },
    { label: 'Physics', emoji: '⚛️', match: ['physics'] },
    { label: 'Chemistry', emoji: '🧪', match: ['chemistry'] },
    { label: 'Biology', emoji: '🧬', match: ['biology'] },
    // Computing
    { label: 'Programming', emoji: '💻', match: ['programming', 'computer science', 'coding'] },
    { label: 'AI & Data', emoji: '🤖', match: ['artificial intelligence', 'data science', 'machine learning'] },
    { label: 'Technology', emoji: '🚀', match: ['technology', 'engineering'] },
    // Humanities
    { label: 'History', emoji: '📜', match: ['history', 'social studies', 'geography'] },
    { label: 'English & Language', emoji: '🌍', match: ['english', 'literature', 'language'] },
    // Commerce
    { label: 'Business', emoji: '💼', match: ['business', 'economics', 'commerce'] },
    // Creative
    { label: 'Design & Arts', emoji: '🎨', match: ['design', 'arts', 'music'] },
    // Professional
    { label: 'Medical', emoji: '🏥', match: ['medical', 'law', 'psychology'] },
];

const CHIP_GRADIENTS = [
    'from-orange-400 to-red-400',
    'from-violet-500 to-purple-400',
    'from-cyan-400 to-blue-400',
    'from-emerald-400 to-teal-400',
    'from-pink-400 to-rose-400',
    'from-yellow-400 to-orange-300',
    'from-indigo-400 to-violet-400',
    'from-fuchsia-400 to-pink-400',
    'from-sky-400 to-cyan-400',
    'from-lime-400 to-green-400',
    'from-red-400 to-orange-400',
    'from-blue-400 to-indigo-400',
    'from-teal-400 to-emerald-400',
    'from-purple-400 to-fuchsia-400',
];

const SORT_OPTIONS = [
    { label: 'Latest', icon: Clock, key: 'latest' },
    { label: 'Trending', icon: TrendingUp, key: 'trending' },
    { label: 'Top Rated', icon: Star, key: 'top' },
];

// Returns true if the video matches the stream category.
// Priority: exact subject field match → keyword scan of title + description.
function videoMatchesStream(video, stream) {
    if (stream.label === 'All') return true;
    const subjectField = (video.subject || '').toLowerCase();
    const text = `${video.title || ''} ${video.description || ''}`.toLowerCase();

    return stream.match.some(keyword =>
        subjectField === keyword ||
        subjectField.includes(keyword) ||
        text.includes(keyword)
    );
}

const Home = () => {
    const { user } = useAuth();
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeStream, setActiveStream] = useState('All');
    const [activeSort, setActiveSort] = useState('latest');
    const [searchParams] = useSearchParams();
    const searchQuery = searchParams.get('search') || '';

    useEffect(() => {
        console.log(`[Home.jsx] Fetching videos from: ${import.meta.env.VITE_API_URL}/api/videos`);
        axios.get(`${import.meta.env.VITE_API_URL}/api/videos`)
            .then(res => {
                console.log(`[Home.jsx] Successfully fetched ${res.data.length} videos from backend.`);
                setVideos(res.data);
            })
            .catch(err => {
                console.error('[Home.jsx] Failed to fetch videos:', err.response?.data || err.message);
            })
            .finally(() => setLoading(false));
    }, []);

    // ── Filtered + sorted list ─────────────────────────────────────────────
    const filtered = useMemo(() => {
        const stream = STREAMS.find(s => s.label === activeStream) || STREAMS[0];
        let data = videos.filter(v => videoMatchesStream(v, stream));

        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            data = data.filter(v =>
                v.title?.toLowerCase().includes(q) ||
                v.uploader?.username?.toLowerCase().includes(q) ||
                v.description?.toLowerCase().includes(q) ||
                (v.subject || '').toLowerCase().includes(q)
            );
        }

        // Sort
        if (activeSort === 'latest') data = [...data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        if (activeSort === 'trending') data = [...data].sort((a, b) => (b.views || 0) - (a.views || 0));
        if (activeSort === 'top') data = [...data].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));

        return data;
    }, [videos, searchQuery, activeStream, activeSort]);

    // ── Per-stream video counts (for badge) ────────────────────────────────
    const streamCounts = useMemo(() => {
        const counts = {};
        STREAMS.forEach(s => {
            counts[s.label] = s.label === 'All'
                ? videos.length
                : videos.filter(v => videoMatchesStream(v, s)).length;
        });
        return counts;
    }, [videos]);

    if (loading) return (
        <div className="flex flex-col justify-center items-center h-[60vh] gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center shadow-lg shadow-red-200 dark:shadow-red-900/30 animate-pulse">
                <BookOpen size={28} className="text-white" />
            </div>
            <p className="text-zinc-400 text-sm animate-pulse">Loading your content...</p>
        </div>
    );

    return (
        <div className="page-enter space-y-6">

            {/* ── Hero Banner (shown only when no search query) ─────────── */}
            {!searchQuery && (
                <div className="gradient-bg rounded-2xl p-8 text-white relative overflow-hidden shadow-2xl">
                    <div className="absolute inset-0 bg-black/20 rounded-2xl" />
                    <div className="relative z-10 max-w-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles size={18} className="text-yellow-300" />
                            <span className="text-sm font-semibold text-yellow-300 uppercase tracking-wider">Welcome to EzyEduTube</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-extrabold mb-3 leading-tight">
                            Learn Anything,<br />Anytime, Anywhere
                        </h1>
                        <p className="text-white/80 text-sm mb-6 max-w-md">
                            Discover thousands of educational videos from expert creators. Your knowledge journey starts here.
                        </p>
                        <div className="flex gap-3 flex-wrap">
                            {user ? (
                                <Link to="/upload">
                                    <button className="px-5 py-2.5 bg-white text-red-600 font-bold rounded-full text-sm hover:bg-yellow-50 transition shadow-lg">
                                        + Share Knowledge
                                    </button>
                                </Link>
                            ) : (
                                <Link to="/register">
                                    <button className="px-5 py-2.5 bg-white text-red-600 font-bold rounded-full text-sm hover:bg-yellow-50 transition shadow-lg">
                                        Get Started Free
                                    </button>
                                </Link>
                            )}
                            <button
                                onClick={() => document.getElementById('video-grid')?.scrollIntoView({ behavior: 'smooth' })}
                                className="px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-full text-sm border border-white/30 transition backdrop-blur-sm"
                            >
                                Browse Videos ↓
                            </button>
                        </div>
                    </div>
                    {/* Decorative */}
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden md:block">
                        <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-white/15 flex items-center justify-center">
                                <BookOpen size={36} className="text-white/80" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Stream / Subject Chips ───────────────────────────────── */}
            <div>
                {/* Section heading */}
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                        <BookOpen size={12} />
                        Filter by Subject / Stream
                    </h2>
                    {activeStream !== 'All' && (
                        <button
                            onClick={() => setActiveStream('All')}
                            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-orange-500 transition"
                        >
                            <X size={12} /> Clear filter
                        </button>
                    )}
                </div>

                {/* Chips row — horizontally scrollable */}
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
                    {STREAMS.map((stream, i) => {
                        const isActive = activeStream === stream.label;
                        const count = streamCounts[stream.label] ?? 0;
                        return (
                            <button
                                key={stream.label}
                                onClick={() => setActiveStream(stream.label)}
                                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all border
                                    ${isActive
                                        ? `bg-gradient-to-r ${CHIP_GRADIENTS[i % CHIP_GRADIENTS.length]} text-white border-transparent shadow-md scale-105`
                                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-orange-300 hover:text-orange-500 dark:hover:text-orange-400 hover:scale-105'
                                    }`}
                            >
                                <span>{stream.emoji}</span>
                                <span>{stream.label}</span>
                                {/* Video count badge */}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive
                                        ? 'bg-white/25 text-white'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                    }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Sort + Result Count ──────────────────────────────────── */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full p-1 shadow-sm">
                    {SORT_OPTIONS.map(({ label, icon: Icon, key }) => (
                        <button
                            key={key}
                            onClick={() => setActiveSort(key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
                                ${activeSort === key
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow'
                                    : 'text-zinc-500 hover:text-orange-500 dark:hover:text-orange-400'
                                }`}
                        >
                            <Icon size={13} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Result pill */}
                <span className="ml-auto text-xs font-medium px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800">
                    {filtered.length} video{filtered.length !== 1 ? 's' : ''}
                    {activeStream !== 'All' ? ` · ${activeStream}` : ''}
                    {searchQuery ? ` · "${searchQuery}"` : ''}
                </span>
            </div>

            {/* ── Video Grid ──────────────────────────────────────────── */}
            <div id="video-grid">
                {filtered.length === 0 ? (
                    <div className="text-center py-24 space-y-4">
                        <div className="text-6xl">🎓</div>
                        <h2 className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">No videos found</h2>
                        <p className="text-zinc-500">
                            {activeStream !== 'All'
                                ? `No "${activeStream}" videos have been uploaded yet.`
                                : searchQuery
                                    ? `No results for "${searchQuery}".`
                                    : 'No videos yet. Be the first to upload!'}
                        </p>
                        <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                            {activeStream !== 'All' && (
                                <button
                                    onClick={() => setActiveStream('All')}
                                    className="px-5 py-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold hover:opacity-90 transition shadow"
                                >
                                    Show All Videos
                                </button>
                            )}
                            {user && (
                                <Link to="/upload">
                                    <button className="px-5 py-2 rounded-full border-2 border-orange-300 text-orange-500 text-sm font-semibold hover:bg-orange-50 dark:hover:bg-orange-900/20 transition">
                                        Upload a {activeStream !== 'All' ? activeStream : ''} Video
                                    </button>
                                </Link>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                        {filtered.map(video => (
                            <VideoCard key={video._id} video={video} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Home;
