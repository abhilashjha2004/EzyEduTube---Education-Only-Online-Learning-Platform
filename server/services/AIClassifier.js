const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const Tesseract = require('tesseract.js');
const natural = require('natural');

ffmpeg.setFfmpegPath(ffmpegPath);

class AIClassifier {
    constructor() {
        this.hfApiKey = process.env.HF_API_KEY;
        this.classifier = new natural.BayesClassifier();
        this.isTrained = false;
        this.trainModel();
    }

    trainModel() {
        // NLP Training Data
        const eduData = [
            'tutorial', 'lecture', 'mathematics', 'calculus', 'algebra', 'science', 'physics',
            'biology', 'chemistry', 'programming', 'python', 'javascript', 'react', 'nodejs',
            'history', 'geography', 'literature', 'exam', 'study', 'course', 'lesson', 'guide',
            'dsa', 'coding', 'sql', 'placement', 'preparation', 'development', 'interview', 'educational', 'os', 'dbms', 'machine learning'
        ];

        const garbageData = [
            'gameplay', 'fortnite', 'minecraft', 'gta', 'pubg', 'kill', 'win', 'prank', 'funny',
            'comedy', 'laugh', 'meme', 'vlog', 'daily', 'challenge', 'movie', 'trailer', 'song',
            'music', 'dance', 'tiktok', 'reel', 'shorts', 'entertainment', 'gossip', 'reaction', 'roast'
        ];

        eduData.forEach(text => this.classifier.addDocument(text, 'educational'));
        garbageData.forEach(text => this.classifier.addDocument(text, 'entertainment'));

        this.classifier.train();
        this.isTrained = true;
        console.log("[AIClassifier] NLP Model Trained.");
    }

    // 1. Download segment of remote video or use direct URL for FFmpeg
    // FFmpeg can read directly from URLs!
    
    // Extract 3 Frames
    async extractFrames(videoUrl, tempDir) {
        return new Promise((resolve, reject) => {
            const screenshots = [];
            const filename = `frame_${Date.now()}`;

            ffmpeg(videoUrl)
                .on('end', () => resolve(screenshots))
                .on('error', (err) => {
                    console.error('[AIClassifier] FFmpeg Frame Extraction Error:', err);
                    resolve([]); // Fail gracefully
                })
                .on('filenames', (filenames) => {
                    filenames.forEach(f => screenshots.push(path.join(tempDir, f)));
                })
                .screenshots({
                    count: 10,
                    folder: tempDir,
                    filename: `${filename}-%i.png`,
                    size: '640x360'
                });
        });
    }

    // Extract Audio (first 30 seconds)
    async extractAudio(videoUrl, tempDir) {
        return new Promise((resolve) => {
            const audioPath = path.join(tempDir, `audio_${Date.now()}.mp3`);
            ffmpeg(videoUrl)
                .setDuration(30) // Only first 30 seconds for lightweight analysis
                .noVideo()
                .audioCodec('libmp3lame')
                .on('end', () => resolve(audioPath))
                .on('error', (err) => {
                    console.error('[AIClassifier] FFmpeg Audio Extraction Error:', err);
                    resolve(null);
                })
                .save(audioPath);
        });
    }

    // OCR scanning
    async scanImageOCR(imagePath) {
        try {
            const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
            return text.toLowerCase();
        } catch (err) {
            console.warn("[AIClassifier] OCR Failed on frame.");
            return "";
        }
    }

    // Hugging Face Image Classification (detect NSFW / Gameplay)
    async classifyImageHF(imagePath) {
        if (!this.hfApiKey) return null;
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            // We use a free efficientnet or resnet model or a specialized content moderation model on HF
            // 'Falconsai/nsfw_image_detection' is a good lightweight model for safety
            const response = await axios.post(
                "https://api-inference.huggingface.co/models/Falconsai/nsfw_image_detection",
                imageBuffer,
                {
                    headers: { Authorization: `Bearer ${this.hfApiKey}`, 'Content-Type': 'application/octet-stream' }
                }
            );
            return response.data; // Array of labels/scores
        } catch (error) {
            console.warn("[AIClassifier] HF Image Classification failed:", error.response?.data || error.message);
            return null;
        }
    }

    // Hugging Face Audio Transcription (Whisper)
    async transcribeAudioHF(audioPath) {
        if (!this.hfApiKey) return "";
        try {
            const audioBuffer = fs.readFileSync(audioPath);
            const response = await axios.post(
                "https://api-inference.huggingface.co/models/openai/whisper-tiny", // Tiny model for speed
                audioBuffer,
                {
                    headers: { Authorization: `Bearer ${this.hfApiKey}`, 'Content-Type': 'audio/mp3' }
                }
            );
            return response.data.text || "";
        } catch (error) {
            console.warn("[AIClassifier] HF Audio Transcription failed:", error.response?.data || error.message);
            return "";
        }
    }

    applyRuleBasedFilter(text) {
        if (!text) return { passed: true, matchedBlacklist: [], matchedWhitelist: [] };
        
        const BLACKLIST = [
            'music', 'song', 'dj', 'remix', 'dance', 'romantic', 'love song', 
            'bhojpuri', 'bollywood', 'hollywood', 'movie', 'trailer', 'comedy', 
            'funny', 'prank', 'gaming', 'gameplay', 'pubg', 'free fire', 
            'minecraft', 'fortnite', 'reaction', 'vlog', 'shorts', 'reels', 
            'status video', 'viral', 'actor', 'actress', 'celebrity', 
            'item song', 'album song', 'khesari', 'pawan', 'bhojpuriya',
            'ipl', 'vivo ipl', 'cricket', 'football', 'sports', 'meme', 'entertainment', 
            'highlights', 'match', 'tournament', 'rcb', 'kkr', 'mi', 'csk', 
            'virat', 'dhoni', 'netflix', 'anime'
        ];

        const WHITELIST = [
            'tutorial', 'lecture', 'course', 'mathematics', 'physics', 'chemistry', 
            'biology', 'coding', 'programming', 'javascript', 'react', 'nodejs', 
            'python', 'java', 'sql', 'dsa', 'data structures', 'algorithms', 
            'machine learning', 'ai', 'education', 'class', 'training', 'lesson', 
            'engineering', 'web development'
        ];

        const lowerText = text.toLowerCase();

        const matchedBlacklist = BLACKLIST.filter(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(lowerText);
        });

        const matchedWhitelist = WHITELIST.filter(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(lowerText);
        });

        return {
            passed: matchedBlacklist.length === 0,
            matchedBlacklist,
            matchedWhitelist
        };
    }

    // Combined Analysis (Async Job)
    async analyzeVideoAsync(task) {
        const { videoId, videoUrl, title, description, tags, isExternal } = task;
        
        console.log(`[AIClassifier] Starting full async analysis for video: ${title}`);
        
        let ocrTextCombined = "";
        let transcript = "";
        let visualConfidence = 100; // Assume good until proven bad
        let isNSFW = false;
        let allVisualLabels = [];

        // Debug Log Variables
        let ruleFilterResult = "Pass";
        let blacklistMatchedStr = "None";
        let whitelistMatchedStr = "None";
        let aiScore = 0;
        let transcriptConfidence = 50;
        let finalDecision = "rejected";

        // Phase 1: Rule-based Filtering on Metadata
        const metadataText = `${title || ''} ${description || ''} ${tags || ''}`;
        const phase1Filter = this.applyRuleBasedFilter(metadataText);
        
        if (!phase1Filter.passed) {
            ruleFilterResult = "Reject";
            blacklistMatchedStr = phase1Filter.matchedBlacklist.join(', ');
            whitelistMatchedStr = phase1Filter.matchedWhitelist.length > 0 ? phase1Filter.matchedWhitelist.join(', ') : "None";
            
            console.log(`
==================================================
[OCR TEXT] N/A (Failed at metadata phase)
[VISUAL LABELS] N/A
[BLACKLIST MATCH] ${blacklistMatchedStr}
[FINAL DECISION] REJECTED
==================================================`);
            
            return { 
                allowed: false, 
                score: 0, 
                visualConfidence: 0, 
                transcriptConfidence: 0, 
                reason: `Rejected by Strict Rule-Based Filter (Metadata matched: ${blacklistMatchedStr})` 
            };
        }

        let totalWhitelistMatches = new Set(phase1Filter.matchedWhitelist);
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moderation-'));

        try {
            // For external YouTube links, we can't easily extract frames via URL in fluent-ffmpeg unless it's a raw video URL.
            // But if it's external, YouTubeValidator already validated it. We will still do NLP on metadata.
            if (!isExternal && videoUrl) {
                // 1. Extract Frames
                const frames = await this.extractFrames(videoUrl, tempDir);
                
                for (const frame of frames) {
                    // 2. Run OCR
                    const text = await this.scanImageOCR(frame);
                    ocrTextCombined += text + " ";

                    // 3. Run HF Visual Moderation (if API key provided)
                    const visualLabels = await this.classifyImageHF(frame);
                    if (visualLabels && Array.isArray(visualLabels)) {
                        allVisualLabels.push(...visualLabels);
                        console.log(`[AIClassifier] Frame visual labels:`, JSON.stringify(visualLabels));
                        for (const l of visualLabels) {
                            const labelName = l.label.toLowerCase();
                            if (['nsfw', 'porn', 'hentai'].includes(labelName) && l.score > 0.6) {
                                isNSFW = true;
                                visualConfidence = 0;
                            }
                            if (['sports', 'stadium', 'cricket', 'game', 'gaming', 'football', 'soccer', 'match'].includes(labelName) && l.score > 0.20) {
                                isNSFW = true; // Using this flag to trigger rejection
                                visualConfidence = 0;
                            }
                        }
                    }
                }

                // 4. Extract Audio & Transcribe
                const audioPath = await this.extractAudio(videoUrl, tempDir);
                if (audioPath) {
                    transcript = await this.transcribeAudioHF(audioPath);
                }
            }

            // Phase 2: Rule-based filtering on Transcript & OCR
            const contentText = `${ocrTextCombined} ${transcript}`;
            const phase2Filter = this.applyRuleBasedFilter(contentText);
            
            if (!phase2Filter.passed) {
                ruleFilterResult = "Reject";
                blacklistMatchedStr = phase2Filter.matchedBlacklist.join(', ');
                whitelistMatchedStr = [...totalWhitelistMatches, ...phase2Filter.matchedWhitelist].join(', ') || "None";
                
                console.log(`
==================================================
[OCR TEXT] ${ocrTextCombined.substring(0, 500)}...
[VISUAL LABELS] ${JSON.stringify(allVisualLabels.slice(0, 5))}...
[BLACKLIST MATCH] ${blacklistMatchedStr}
[FINAL DECISION] REJECTED
==================================================`);

                return { 
                    allowed: false, 
                    score: 0, 
                    visualConfidence: visualConfidence, 
                    transcriptConfidence: 0,
                    reason: `Rejected by Strict Rule-Based Filter (Content matched: ${blacklistMatchedStr})` 
                };
            }

            phase2Filter.matchedWhitelist.forEach(w => totalWhitelistMatches.add(w));
            whitelistMatchedStr = totalWhitelistMatches.size > 0 ? Array.from(totalWhitelistMatches).join(', ') : "None";

            if (isNSFW) {
                console.log(`
==================================================
[OCR TEXT] ${ocrTextCombined.substring(0, 500)}...
[VISUAL LABELS] ${JSON.stringify(allVisualLabels.slice(0, 10))}...
[BLACKLIST MATCH] ${blacklistMatchedStr}
[FINAL DECISION] REJECTED (Visual Threshold Exceeded)
==================================================`);
                return { allowed: false, score: 0, visualConfidence: 0, transcriptConfidence: 0, reason: "Visual analysis detected explicit, sports, gaming, or entertainment content." };
            }

            // 5. NLP Combined Scoring
            const combinedText = `${metadataText} ${contentText}`.toLowerCase();
            const nlpClass = this.classifier.classify(combinedText);
            console.log(`[DEBUG: AIClassifier] NLP Classification result: ${nlpClass}`);
            
            let finalScore = 50;

            if (nlpClass === 'educational') {
                finalScore += 30; // base edu boost
                transcriptConfidence = 80;
            } else {
                finalScore -= 20; // base entertainment penalty
                transcriptConfidence = 20;
            }

            if (totalWhitelistMatches.size >= 2) {
                finalScore += 20;
            } else if (totalWhitelistMatches.size === 1) {
                finalScore += 10;
            }

            // Cap scores
            finalScore = Math.min(100, Math.max(0, finalScore));
            aiScore = finalScore;

            // Strict Final Approval Logic
            let allowed = false;
            // Require finalScore >= 80, transcript >= 50, visual == 100
            if (finalScore >= 80 && transcriptConfidence >= 50 && visualConfidence === 100) {
                allowed = true;
                finalDecision = "approved";
            }

            console.log(`
==================================================
[OCR TEXT] ${ocrTextCombined.substring(0, 500)}...
[VISUAL LABELS] ${JSON.stringify(allVisualLabels.slice(0, 10))}...
[BLACKLIST MATCH] None
[FINAL DECISION] ${finalDecision.toUpperCase()}
==================================================`);

            if (!allowed) {
                return { 
                    allowed: false, 
                    score: finalScore, 
                    visualConfidence, 
                    transcriptConfidence, 
                    reason: `Failed confidence threshold (Score: ${finalScore}). Content appears non-educational.` 
                };
            }

            return { 
                allowed: true, 
                score: finalScore, 
                visualConfidence, 
                transcriptConfidence, 
                reason: "Approved as educational." 
            };

        } catch (error) {
            console.error('[AIClassifier] Error during analysis:', error);
            throw error;
        } finally {
            // Cleanup temp dir
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

module.exports = new AIClassifier();
