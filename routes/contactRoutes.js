const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const ContactSettings = require('../models/ContactSettings');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

// 1. GET DYNAMIC CONTACT INFO & SETTINGS (Public)
router.get('/settings', async (req, res) => {
  try {
    let settings = await ContactSettings.findOne();
    if (!settings) {
      // Create defaults if not found
      settings = await ContactSettings.create({});
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. UPDATE DYNAMIC CONTACT INFO & SETTINGS (Admin Only)
router.put('/settings', protect, adminOnly, async (req, res) => {
  try {
    let settings = await ContactSettings.findOne();
    if (!settings) {
      settings = new ContactSettings(req.body);
    } else {
      settings.address = req.body.address !== undefined ? req.body.address : settings.address;
      settings.phone = req.body.phone !== undefined ? req.body.phone : settings.phone;
      settings.email = req.body.email !== undefined ? req.body.email : settings.email;
      settings.whatsapp = req.body.whatsapp !== undefined ? req.body.whatsapp : settings.whatsapp;
      settings.businessHours = req.body.businessHours !== undefined ? req.body.businessHours : settings.businessHours;
      settings.googleMap = req.body.googleMap !== undefined ? req.body.googleMap : settings.googleMap;
      settings.facebook = req.body.facebook !== undefined ? req.body.facebook : settings.facebook;
      settings.instagram = req.body.instagram !== undefined ? req.body.instagram : settings.instagram;
      settings.tiktok = req.body.tiktok !== undefined ? req.body.tiktok : settings.tiktok;
      settings.youtube = req.body.youtube !== undefined ? req.body.youtube : settings.youtube;
      settings.linkedin = req.body.linkedin !== undefined ? req.body.linkedin : settings.linkedin;
    }
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3. SUBMIT CONTACT INQUIRY MESSAGE (Public)
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Name, Email and Message are required fields.' });
    }

    const newInquiry = await Contact.create({
      name,
      email,
      phone: phone || '',
      subject: subject || '',
      message
    });

    res.status(201).json({ message: 'Inquiry submitted successfully.', inquiry: newInquiry });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 4. GET ALL CONTACT INQUIRY MESSAGES (Admin/Moderator Only)
router.get('/', protect, adminOrModerator, async (req, res) => {
  try {
    const inquiries = await Contact.find().sort({ createdAt: -1 });
    res.json(inquiries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 5. MARK CONTACT INQUIRY MESSAGE AS READ (Admin/Moderator Only)
router.patch('/:id/read', protect, adminOrModerator, async (req, res) => {
  try {
    const inquiry = await Contact.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry message not found.' });
    }
    inquiry.isRead = !inquiry.isRead;
    await inquiry.save();
    res.json(inquiry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 6. DELETE CONTACT INQUIRY MESSAGE (Admin/Moderator Only)
router.delete('/:id', protect, adminOrModerator, async (req, res) => {
  try {
    const inquiry = await Contact.findByIdAndDelete(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry message not found.' });
    }
    res.json({ message: 'Inquiry message deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
