const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');

const setupChatSocket = (io) => {
    // JWT authentication
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('Authentication required'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId).select('name');
            if (!user) return next(new Error('User not found'));

            socket.userId = decoded.userId.toString();
            socket.userName = user.name;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log('🟢 Connected:', socket.userId);

        socket.on('join_room', (roomId) => {
            if (typeof roomId !== 'string' || roomId.length > 100) return;

            const userIds = roomId.split('_');
            if (userIds.length !== 2) {
                return socket.emit('error', { message: 'Invalid room' });
            }
            if (!userIds.includes(socket.userId)) {
                return socket.emit('error', { message: 'Not authorized' });
            }

            // Leave all other rooms first (only 1 active room per socket)
            Array.from(socket.rooms).forEach(r => {
                if (r !== socket.id) socket.leave(r);
            });

            socket.join(roomId);
            socket.currentRoom = roomId;
        });

        socket.on('send_message', async (data) => {
            try {
                const { roomId, message } = data;

                // Validation
                if (!message || typeof message !== 'string') {
                    return socket.emit('error', { message: 'Invalid message' });
                }
                const trimmed = message.trim();
                if (trimmed.length === 0 || trimmed.length > 1000) {
                    return socket.emit('error', { message: 'Message must be 1-1000 chars' });
                }

                // Verify user belongs to room
                const userIds = roomId.split('_');
                if (userIds.length !== 2 || !userIds.includes(socket.userId)) {
                    return socket.emit('error', { message: 'Not authorized' });
                }

                const receiverId = userIds.find(id => id !== socket.userId);

                // Verify receiver exists
                const receiverExists = await User.exists({ _id: receiverId });
                if (!receiverExists) {
                    return socket.emit('error', { message: 'Receiver not found' });
                }

                const newMessage = await Message.create({
                    roomId,
                    senderId: socket.userId,
                    receiverId,
                    message: trimmed
                });

                io.to(roomId).emit('receive_message', newMessage);
            } catch (error) {
                console.error('Message error:', error.message);
                socket.emit('error', { message: 'Failed to send' });
            }
        });

        socket.on('typing', (data) => {
            // Validate typing event
            if (!data.roomId || !socket.currentRoom || socket.currentRoom !== data.roomId) {
                return;
            }
            const userIds = data.roomId.split('_');
            if (!userIds.includes(socket.userId)) return;

            socket.to(data.roomId).emit('user_typing', {
                userId: socket.userId,
                userName: socket.userName
            });
        });

        socket.on('disconnect', () => {
            console.log('🔴 Disconnected:', socket.userId);
        });
    });
};

module.exports = setupChatSocket;