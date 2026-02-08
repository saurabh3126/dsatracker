const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const { connectMongo, disconnectMongo } = require('./backend/src/db/connect');
const leetcodeRoutes = require('./backend/src/routes/leetcode');
const authRoutes = require('./backend/src/routes/auth');
const catalogRoutes = require('./backend/src/routes/catalog');
const revisionRoutes = require('./backend/src/routes/revision');
const solvedRoutes = require('./backend/src/routes/solved');
const aiRoutes = require('./backend/src/routes/ai');
const feedbackRoutes = require('./backend/src/routes/feedback');

const { requireAuth } = require('./backend/src/middleware/requireAuth');
const User = require('./backend/src/models/User');
 

const app = express();
const PORT = Number(process.env.PORT || 3000);
let server;
let isShuttingDown = false;

// Middleware
app.use(cors());
app.use(express.json());

// Local-only helper: serve repo-root static files (screenshots) at /_static/*
// Useful for verifying legacy UI screenshots after migration.
app.use('/_static', express.static(__dirname, { index: false, dotfiles: 'ignore' }));

const clientDist = path.join(__dirname, './client/dist');
const clientIndexHtml = path.join(clientDist, 'index.html');

if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
}

// Path to data.json
const dataFile = path.join(__dirname, './questions/data.json');

// Initialize data.json if it doesn't exist
const initializeData = async () => {
    try {
        await fs.ensureFile(dataFile);
        let data;
        try {
            data = await fs.readJson(dataFile);
        } catch {
            data = null;
        }

        const looksInitialized =
            data &&
            typeof data === 'object' &&
            Array.isArray(data.questions) &&
            Array.isArray(data.practiceLogs) &&
            data.topics &&
            typeof data.topics === 'object';

        if (looksInitialized) {
            console.log('Data file already initialized');
            return;
        }

        const defaultData = {
            questions: [],
            practiceLogs: [],
            starredQuestions: [],
            topics: {
                "Sorting Techniques": {
                    "name": "Sorting Techniques",
                    "description": "Basic and advanced sorting algorithms",
                    "subTopics": ["Basic Sorting", "Quick Sort", "Merge Sort"],
                    "patterns": ["In-place", "Divide & Conquer"]
                },
                "Arrays": {
                    "name": "Arrays",
                    "description": "Array manipulation and algorithms",
                    "subTopics": ["Basic Operations", "Two Pointers", "Sliding Window"],
                    "patterns": ["In-place modification", "Two Pointers"]
                }
            }
        };

        await fs.writeJson(dataFile, defaultData, { spaces: 2 });
        console.log('Data file initialized successfully');
    } catch (error) {
        console.error('Error initializing data file:', error);
        process.exit(1); // Exit if we can't initialize the data file
    }
};

// Data validation middleware
const validateQuestionData = (req, res, next) => {
    const { title, difficulty, topic, subTopic, link } = req.body;
    
    if (!title || !difficulty || !topic) {
        return res.status(400).json({ 
            error: 'Missing required fields', 
            required: ['title', 'difficulty', 'topic'] 
        });
    }

    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!validDifficulties.includes(difficulty)) {
        return res.status(400).json({ 
            error: 'Invalid difficulty level',
            valid: validDifficulties 
        });
    }

    next();
};

// Routes
app.get('/', (req, res) => {
    if (fs.existsSync(clientIndexHtml)) {
        return res.sendFile(clientIndexHtml);
    }
    return res
        .status(200)
        .type('text/plain')
        .send('Client not built. Run `npm run dev` and open http://localhost:5173, or run `npm run build` then `npm start`.');
});

app.get('/questions', (req, res) => {
    if (fs.existsSync(clientIndexHtml)) {
        return res.sendFile(clientIndexHtml);
    }
    return res
        .status(200)
        .type('text/plain')
        .send('Client not built. Run `npm run dev` and open http://localhost:5173.');
});

app.get('/add', (req, res) => {
    if (fs.existsSync(clientIndexHtml)) {
        return res.sendFile(clientIndexHtml);
    }
    return res
        .status(200)
        .type('text/plain')
        .send('Client not built. Run `npm run dev` and open http://localhost:5173.');
});

// SPA fallback for React router paths (only when built)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (fs.existsSync(clientIndexHtml)) {
        return res.sendFile(clientIndexHtml);
    }
    return next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leetcode', leetcodeRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/revision', revisionRoutes);
app.use('/api/solved', solvedRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/feedback', feedbackRoutes);

// Health check (useful to debug Mongo connectivity)
app.get('/api/health', (req, res) => {
    const readyState = mongoose.connection.readyState;
    const stateName =
        readyState === 0 ? 'disconnected' :
        readyState === 1 ? 'connected' :
        readyState === 2 ? 'connecting' :
        readyState === 3 ? 'disconnecting' :
        'unknown';

    return res.json({
        ok: true,
        mongo: {
            readyState,
            state: stateName,
            hasUri: Boolean(process.env.MONGO_URI),
        },
    });
});

// Get all data
app.get('/api/data', requireAuth, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);

        const userId = String(req.user?._id || '');
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Safe legacy migration: only assign legacy (unowned) questions to the
        // current user if there is exactly ONE user in the system.
        const questions = Array.isArray(data?.questions) ? data.questions : [];
        const practiceLogs = Array.isArray(data?.practiceLogs) ? data.practiceLogs : [];

        const hasLegacyQuestions = questions.some((q) => !q?.userId);
        const hasLegacyLogs = practiceLogs.some((l) => !l?.userId);

        if (hasLegacyQuestions || hasLegacyLogs) {
            const userCount = await User.countDocuments({});
            if (userCount === 1) {
                let touched = false;
                questions.forEach((q) => {
                    if (q && !q.userId) {
                        q.userId = userId;
                        touched = true;
                    }
                });
                practiceLogs.forEach((l) => {
                    if (l && !l.userId) {
                        l.userId = userId;
                        touched = true;
                    }
                });
                if (touched) {
                    await fs.writeJson(dataFile, data, { spaces: 2 });
                }
            }
        }

        const scopedQuestions = questions.filter((q) => String(q?.userId || '') === userId);
        const scopedLogs = practiceLogs.filter((l) => String(l?.userId || '') === userId);

        res.json({
            questions: scopedQuestions,
            practiceLogs: scopedLogs,
            topics: data?.topics && typeof data.topics === 'object' ? data.topics : {},
        });
    } catch (error) {
        console.error('Error reading data:', error);
        res.status(500).json({ error: 'Error reading data' });
    }
});

// Add new question
app.post('/api/questions', requireAuth, validateQuestionData, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);

        const userId = String(req.user?._id || '');
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const newQuestion = {
            id: Date.now().toString(),
            userId,
            dateAdded: new Date().toISOString(),
            status: 'Not Started',
            confidence: 1,
            lastPracticed: null,
            ...req.body
        };

        // Ensure arrays are properly initialized
        newQuestion.tags = Array.isArray(req.body.tags) ? req.body.tags : [];
        newQuestion.commonPitfalls = Array.isArray(req.body.commonPitfalls) ? req.body.commonPitfalls : [];
        newQuestion.approach = Array.isArray(req.body.approach) ? req.body.approach : [];

        data.questions.push(newQuestion);
        await fs.writeJson(dataFile, data, { spaces: 2 });
        
        console.log('Question added successfully:', newQuestion.title);
        res.status(201).json(newQuestion);
    } catch (error) {
        console.error('Error adding question:', error);
        res.status(500).json({ error: 'Error adding question' });
    }
});

// Update question
app.put('/api/questions/:id', requireAuth, validateQuestionData, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);

        const userId = String(req.user?._id || '');
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const index = (Array.isArray(data?.questions) ? data.questions : []).findIndex(
            (q) => q?.id === req.params.id && String(q?.userId || '') === userId
        );
        
        if (index === -1) {
            return res.status(404).json({ error: 'Question not found' });
        }

        data.questions[index] = {
            ...data.questions[index],
            ...req.body,
            // Never allow changing ownership
            userId,
            lastModified: new Date().toISOString(),
        };

        await fs.writeJson(dataFile, data, { spaces: 2 });
        console.log('Question updated successfully:', data.questions[index].title);
        res.json(data.questions[index]);
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ error: 'Error updating question' });
    }
});

// Delete question
app.delete('/api/questions/:id', requireAuth, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);

        const userId = String(req.user?._id || '');
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const questions = Array.isArray(data?.questions) ? data.questions : [];
        const initialLength = questions.length;
        data.questions = questions.filter((q) => !(q?.id === req.params.id && String(q?.userId || '') === userId));
        
        if (data.questions.length === initialLength) {
            return res.status(404).json({ error: 'Question not found' });
        }

        await fs.writeJson(dataFile, data, { spaces: 2 });
        console.log('Question deleted successfully');
        res.json({ message: 'Question deleted successfully' });
    } catch (error) {
        console.error('Error deleting question:', error);
        res.status(500).json({ error: 'Error deleting question' });
    }
});

// Add practice log
app.post('/api/practice', requireAuth, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        const { questionId, timeTaken, solvedWithoutHelp, notes } = req.body;

        const userId = String(req.user?._id || '');
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Validate practice data
        if (!questionId || !timeTaken) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const question = (Array.isArray(data?.questions) ? data.questions : []).find(
            (q) => q?.id === questionId && String(q?.userId || '') === userId
        );
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const practiceLog = {
            id: Date.now().toString(),
            userId,
            questionId,
            timeTaken,
            solvedWithoutHelp,
            notes,
            date: new Date().toISOString()
        };

        data.practiceLogs.push(practiceLog);

        // Update question status
        question.lastPracticed = practiceLog.date;
        question.confidence = Math.min(5, solvedWithoutHelp ? 
            (question.confidence || 0) + 1 : 
            (question.confidence || 0));
        question.status = question.confidence >= 4 ? 'Mastered' : 
                         question.confidence >= 2 ? 'In Progress' : 
                         'Not Started';

        await fs.writeJson(dataFile, data, { spaces: 2 });
        console.log('Practice log added successfully');
        res.status(201).json(practiceLog);
    } catch (error) {
        console.error('Error adding practice log:', error);
        res.status(500).json({ error: 'Error adding practice log' });
    }
});

function normalizeStarSource(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeStarRef(value) {
    return String(value || '').trim();
}

function makeStarKey(source, ref) {
    const s = normalizeStarSource(source);
    const r = String(normalizeStarRef(ref)).toLowerCase();
    return s && r ? `${s}:${r}` : '';
}

// Get starred questions for the current user
app.get('/api/starred', requireAuth, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        const userId = String(req.user?._id || '');
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const items = Array.isArray(data?.starredQuestions) ? data.starredQuestions : [];
        const scoped = items
            .filter((x) => String(x?.userId || '') === userId)
            .sort((a, b) => new Date(b?.starredAt || b?.createdAt || 0).getTime() - new Date(a?.starredAt || a?.createdAt || 0).getTime());

        return res.json({ items: scoped });
    } catch (error) {
        console.error('Error reading starred questions:', error);
        return res.status(500).json({ error: 'Error reading starred questions' });
    }
});

// Toggle starred state for a question
app.post('/api/starred/toggle', requireAuth, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        const userId = String(req.user?._id || '');
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        if (!data || typeof data !== 'object') {
            return res.status(500).json({ error: 'Data store not initialized' });
        }

        if (!Array.isArray(data.starredQuestions)) data.starredQuestions = [];

        const source = normalizeStarSource(req.body?.source);
        const ref = normalizeStarRef(req.body?.ref);
        const title = String(req.body?.title || '').trim();
        const difficulty = String(req.body?.difficulty || '').trim();
        const link = String(req.body?.link || '').trim();

        if (!source || !ref || !title) {
            return res.status(400).json({ error: 'source, ref, and title are required' });
        }

        const questionKey = makeStarKey(source, ref);
        if (!questionKey) {
            return res.status(400).json({ error: 'Invalid source/ref' });
        }

        const list = data.starredQuestions;
        const idx = list.findIndex((x) => String(x?.userId || '') === userId && String(x?.questionKey || '') === questionKey);

        if (idx >= 0) {
            const removed = list[idx];
            list.splice(idx, 1);
            await fs.writeJson(dataFile, data, { spaces: 2 });
            return res.json({ starred: false, removedKey: questionKey, removed });
        }

        const item = {
            id: Date.now().toString(),
            userId,
            questionKey,
            source,
            ref,
            title,
            difficulty: difficulty || null,
            link: link || '',
            notes: '',
            starredAt: new Date().toISOString(),
        };

        list.push(item);
        await fs.writeJson(dataFile, data, { spaces: 2 });
        return res.status(201).json({ starred: true, item });
    } catch (error) {
        console.error('Error toggling starred question:', error);
        return res.status(500).json({ error: 'Error updating starred questions' });
    }
});

// Update notes for a starred question
app.patch('/api/starred/note', requireAuth, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        const userId = String(req.user?._id || '');
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        if (!data || typeof data !== 'object') {
            return res.status(500).json({ error: 'Data store not initialized' });
        }

        if (!Array.isArray(data.starredQuestions)) data.starredQuestions = [];

        const source = normalizeStarSource(req.body?.source);
        const ref = normalizeStarRef(req.body?.ref);
        const questionKey = makeStarKey(source, ref);
        if (!questionKey) return res.status(400).json({ error: 'Invalid source/ref' });

        const notesRaw = String(req.body?.notes ?? '');
        const notes = notesRaw.trim().slice(0, 1000);

        const list = data.starredQuestions;
        const idx = list.findIndex((x) => String(x?.userId || '') === userId && String(x?.questionKey || '') === questionKey);
        if (idx < 0) return res.status(404).json({ error: 'Starred question not found' });

        const prev = list[idx] || {};
        const next = { ...prev, notes, updatedAt: new Date().toISOString() };
        list[idx] = next;

        await fs.writeJson(dataFile, data, { spaces: 2 });
        return res.json({ item: next });
    } catch (error) {
        console.error('Error updating starred notes:', error);
        return res.status(500).json({ error: 'Error updating starred notes' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error', 
        message: err.message 
    });
});

// Initialize and start server
(async () => {
    try {
        const mongo = await connectMongo();
        console.log(`MongoDB: ${mongo.connected ? 'connected' : 'not connected'} (${mongo.reason})`);

        // Optional: fail fast when Mongo is required (e.g., for auth features).
        const requireMongo = String(process.env.REQUIRE_MONGO || '').toLowerCase() === 'true';
        if (requireMongo && !mongo.connected) {
            throw new Error('MongoDB connection is required (set REQUIRE_MONGO=false to allow running without Mongo)');
        }

        await initializeData();
        server = app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log('Available routes:');
            console.log('- / (Home)');
            console.log('- /questions (Questions List)');
            console.log('- /add (Add New Question)');
        });

        server.on('error', (err) => {
            if (err?.code === 'EADDRINUSE') {
                console.error(`Port ${PORT} is already in use. If you're running dev mode, stop the other server process using this port and try again.`);
                process.exit(1);
                return;
            }

            console.error('Server error:', err);
            process.exit(1);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
})();

// Graceful shutdown
async function shutdown({ signal }) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`${signal} received. Shutting down gracefully...`);

    // Ensure we always exit so the port is freed (important for nodemon restarts on Windows).
    const hardTimeout = setTimeout(() => {
        console.log('Force exiting after shutdown timeout');
        process.exit(0);
    }, 5000);

    const finalize = async () => {
        try {
            await disconnectMongo();
        } catch (_) {
            // ignore
        }

        clearTimeout(hardTimeout);
        process.exit(0);
    };

    if (!server) {
        await finalize();
        return;
    }

    server.close(async () => {
        console.log('Server closed');
        await finalize();
    });
}

process.on('SIGTERM', () => shutdown({ signal: 'SIGTERM' }));
process.on('SIGINT', () => shutdown({ signal: 'SIGINT' }));
process.on('SIGUSR2', () => shutdown({ signal: 'SIGUSR2' }));