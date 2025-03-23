require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const flash = require('connect-flash');
const session = require('express-session');
const app = express();
const port = 3000;

// MongoDB Atlas connection
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
.then(() => {
    console.log('Connected to MongoDB Atlas successfully!');
})
.catch((err) => {
    console.error('Error connecting to MongoDB Atlas:', err);
});

// Schema for Media
const mediaSchema = new mongoose.Schema({
    filename: String,
    path: String,
    type: String,
    hash: String
});

const Media = mongoose.model('Media', mediaSchema);

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function(req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage }).array('media', 10); // Allow up to 10 files

// Calculate file hash
const calculateHash = (filePath) => {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
};

// Middleware
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));
app.use(flash());
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    next();
});

// Routes
app.get('/', async (req, res) => {
    try {
        const mediaFiles = await Media.find();
        res.render('index', { mediaFiles });
    } catch (err) {
        console.error('Error fetching media files:', err);
        res.status(500).send('Error fetching media files.');
    }
});

app.post('/upload', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            req.flash('error_msg', 'Error uploading files.');
            return res.redirect('/');
        }

        const files = req.files;
        if (!files || files.length === 0) {
            req.flash('error_msg', 'No files uploaded.');
            return res.redirect('/');
        }

        for (const file of files) {
            const filePath = path.join(__dirname, 'public', 'uploads', file.filename);
            const fileHash = calculateHash(filePath);

            // Check for duplicate files
            const existingMedia = await Media.findOne({ hash: fileHash });
            if (existingMedia) {
                fs.unlinkSync(filePath); // Delete the duplicate file
                continue;
            }

            const newMedia = new Media({
                filename: file.filename,
                path: `/uploads/${file.filename}`,
                type: file.mimetype.startsWith('image') ? 'image' : 'video',
                hash: fileHash
            });

            await newMedia.save();
        }

        req.flash('success_msg', 'Files uploaded successfully!');
        res.redirect('/');
    });
});

app.post('/delete/:id', async (req, res) => {
    try {
        const media = await Media.findByIdAndDelete(req.params.id);
        if (!media) {
            req.flash('error_msg', 'Media not found');
            return res.redirect('/');
        }
        // Delete file from the server
        const filePath = path.join(__dirname, 'public', media.path);
        fs.unlinkSync(filePath);
        req.flash('success_msg', 'File deleted successfully!');
        res.redirect('/');
    } catch (err) {
        console.error('Error deleting media:', err);
        req.flash('error_msg', 'Error deleting media');
        res.redirect('/');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});