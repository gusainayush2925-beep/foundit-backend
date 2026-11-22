const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');
const setupChatSocket = require('./src/sockets/chatSocket');

connectDB();

const app = express();
const server = http.createServer(app);

// ============ CORS CONFIG ============
const isProd = process.env.NODE_ENV === 'production';
const prodOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

const corsOrigin = isProd ? prodOrigins : true;

const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/items', require('./src/routes/itemRoutes'));
app.use('/api/claims', require('./src/routes/claimRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/admin', require('./src/routes/adminRoutes'));
app.use('/api/chat', require('./src/routes/chatRoutes'));

// Health check (Render needs this)
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🎉 FoundIt API is Running!',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

setupChatSocket(io);

app.use(errorHandler);

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log('═══════════════════════════════════');
    console.log(`🚀 FoundIt Backend Started`);
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('═══════════════════════════════════');
});