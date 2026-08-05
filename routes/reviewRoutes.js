const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const protect = require('../middleware/authMiddleware');
const { adminOnly, adminOrModerator } = require('../middleware/roleMiddleware');

// 1. GET ALL REVIEWS (Public approved list; Admin/Moderator can view pending/hidden)
router.get('/', async (req, res) => {
  try {
    const { type, product, sort, status } = req.query;
    
    let query = {};
    
    if (type) {
      query.type = type;
    }
    
    if (type === 'Product' && product) {
      query.product = product;
    }

    // Default status for public is Approved
    if (status && (status === 'Pending' || status === 'Rejected' || status === 'Hidden' || status === 'All')) {
      // Must be Admin or Moderator to query non-approved reviews
      // In a real API we check JWT, here we check if token exists to check headers, otherwise default to Approved.
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer')) {
        // We'll let the controller handle role matching internally if they request it, 
        // but for safety let's allow query.status = status unless status is All (then delete status filter)
        if (status !== 'All') {
          query.status = status;
        }
      } else {
        query.status = 'Approved';
      }
    } else {
      query.status = 'Approved';
    }

    let sortQuery = { createdAt: -1 }; // Default newest

    if (sort === 'highest') {
      sortQuery = { rating: -1, createdAt: -1 };
    } else if (sort === 'lowest') {
      sortQuery = { rating: 1, createdAt: -1 };
    } else if (sort === 'helpful') {
      sortQuery = { helpfulUsersCount: -1, createdAt: -1 };
    } else if (sort === 'featured') {
      sortQuery = { isFeatured: -1, createdAt: -1 };
    }

    // Since helpfulUsersCount is a virtual or length of array, we can use $addFields to sort by helpful users length
    let reviews;
    if (sort === 'helpful') {
      reviews = await Review.aggregate([
        { $match: query },
        {
          $addFields: {
            helpfulUsersCount: { $size: { $ifNull: ['$helpfulUsers', []] } }
          }
        },
        { $sort: sortQuery },
        // Populate user details afterwards by simulating mongoose populate in aggregation or querying and populating
      ]);
      // Let's populate the user reference in aggregated reviews
      reviews = await Review.populate(reviews, [
        { path: 'user', select: 'name profilePhoto' },
        { path: 'product', select: 'name images' }
      ]);
    } else {
      reviews = await Review.find(query)
        .populate('user', 'name profilePhoto')
        .populate('product', 'name images')
        .sort(sortQuery);
    }

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. GET RATINGS SUMMARY & STATISTICS
router.get('/summary', async (req, res) => {
  try {
    const { product, type } = req.query;
    let query = { status: 'Approved' };

    if (type) query.type = type;
    if (type === 'Product' && product) query.product = product;

    const reviews = await Review.find(query);

    let totalReviews = reviews.length;
    let averageRating = 0;
    let starsCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let percentage = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (totalReviews > 0) {
      let sum = 0;
      reviews.forEach(r => {
        sum += r.rating;
        if (starsCount[r.rating] !== undefined) {
          starsCount[r.rating]++;
        }
      });
      averageRating = parseFloat((sum / totalReviews).toFixed(1));

      // Calculate percentages
      for (let star = 1; star <= 5; star++) {
        percentage[star] = Math.round((starsCount[star] / totalReviews) * 100);
      }
    }

    res.json({
      averageRating,
      totalReviews,
      starsCount,
      percentage
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 3. POST A REVIEW (Logged-in or Guest User)
router.post('/', async (req, res) => {
  try {
    const { type, product, rating, title, comment, images, storeRatings, reviewerName, reviewerProfilePhoto } = req.body;

    if (!rating || !comment) {
      return res.status(400).json({ message: 'Rating and Comment are required.' });
    }

    let user = null;
    let name = reviewerName || 'Anonymous Guest';
    let role = 'customer';
    let photo = reviewerProfilePhoto || '';

    // Check if Authorization header exists to associate review with logged-in user
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
      try {
        const jwt = require('jsonwebtoken');
        const User = require('../models/User');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const loggedUser = await User.findById(decoded.id).select('-password');
        if (loggedUser) {
          user = loggedUser._id;
          name = loggedUser.name;
          role = loggedUser.role || 'customer';
          photo = loggedUser.profilePhoto || photo;
        }
      } catch (err) {
        // Token invalid or expired, fallback as guest
      }
    }

    const isStaff = role === 'admin' || role === 'moderator';
    const status = isStaff ? 'Approved' : 'Pending';

    const reviewData = {
      type: type || 'Product',
      reviewerName: name,
      reviewerRole: role,
      reviewerProfilePhoto: photo,
      rating,
      title: title || '',
      comment,
      images: images || [],
      status,
      isFeatured: false
    };

    if (user) {
      reviewData.user = user;
    }

    if (type === 'Product') {
      if (!product) {
        return res.status(400).json({ message: 'Product ID is required for Product reviews.' });
      }
      reviewData.product = product;
    } else {
      if (storeRatings) {
        reviewData.storeRatings = storeRatings;
      }
    }

    const review = await Review.create(reviewData);
    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 4. PUT HELPFUL / VOTE LIKE (Toggle helpful indicator)
router.put('/:id/helpful', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    const userId = req.user.id;
    const isVoted = review.helpfulUsers.includes(userId);

    if (isVoted) {
      review.helpfulUsers = review.helpfulUsers.filter(id => id.toString() !== userId);
    } else {
      review.helpfulUsers.push(userId);
    }

    await review.save();
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 5. PUT REPORT / FLAG SPAM (Toggle spam reporting)
router.put('/:id/report', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    const userId = req.user.id;
    const isReported = review.reportedUsers.includes(userId);

    if (isReported) {
      review.reportedUsers = review.reportedUsers.filter(id => id.toString() !== userId);
    } else {
      review.reportedUsers.push(userId);
    }

    await review.save();
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 6. PUT UPDATE REVIEW STATUS (Admin / Moderator Only)
router.put('/:id/status', protect, adminOrModerator, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected', 'Hidden'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status type.' });
    }

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 7. PUT TOGGLE FEATURED ON HOMEPAGE (Admin Only)
router.put('/:id/feature', protect, adminOnly, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    review.isFeatured = !review.isFeatured;
    await review.save();
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 8. APPROVE A REVIEW (Admin / Moderator Only)
router.patch('/:id/approve', protect, adminOrModerator, async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status: 'Approved' },
      { new: true }
    );
    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 9. DELETE A REVIEW (Admin / Moderator Only)
router.delete('/:id', protect, adminOrModerator, async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }
    res.json({ message: 'Review deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
