const mongoose = require('mongoose');

const contactSettingsSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      default: 'House 12, Road 5, Dhanmondi, Dhaka, Bangladesh'
    },
    phone: {
      type: String,
      default: '+880 1700-000000'
    },
    email: {
      type: String,
      default: 'support@nushaat.com'
    },
    whatsapp: {
      type: String,
      default: '8801700000000'
    },
    businessHours: {
      type: String,
      default: 'Saturday - Thursday: 10:00 AM - 8:00 PM'
    },
    googleMap: {
      type: String,
      default: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3651.902442430136!2d90.3724393!3d23.7508731!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3755b8b33cffc3c7%3A0x8f3c7e3f7457efbd!2sDhanmondi%2C%20Dhaka!5e0!3m2!1sen!2sbd!4v1700000000000!5m2!1sen!2sbd'
    },
    facebook: {
      type: String,
      default: 'https://facebook.com/nushaat'
    },
    instagram: {
      type: String,
      default: 'https://instagram.com/nushaat'
    },
    tiktok: {
      type: String,
      default: 'https://tiktok.com/@nushaat'
    },
    youtube: {
      type: String,
      default: 'https://youtube.com/c/nushaat'
    },
    linkedin: {
      type: String,
      default: 'https://linkedin.com/company/nushaat'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('ContactSettings', contactSettingsSchema);
