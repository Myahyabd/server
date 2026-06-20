const express = require('express');

const router = express.Router();

const Product = require('../models/Product');

const protect = require('../middleware/authMiddleware');

const { adminOrModerator, adminOnly } = require('../middleware/roleMiddleware');

// ==============================
// ADD PRODUCT
// ==============================
router.post(
  '/',

  protect,
  adminOrModerator,

  async (req, res) => {
    try {
      const product = await Product.create({
        ...req.body,

        createdBy: req.user.id,
      });

      res.status(201).json(product);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

// ==============================
// CREATE REVIEW
// ==============================
router.post(
  '/:id/reviews',

  protect,

  async (req, res) => {
    try {
      const { rating, comment } = req.body;

      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          message: 'Product not found',
        });
      }

      // CHECK EXISTING REVIEW
      const alreadyReviewed = product.reviews.find(
        review => review.user.toString() === req.user.id,
      );

      if (alreadyReviewed) {
        return res.status(400).json({
          message: 'Product already reviewed',
        });
      }

      // NEW REVIEW
      const review = {
        user: req.user.id,

        name: req.user.name,

        rating: Number(rating),

        comment,
      };

      // PUSH REVIEW
      product.reviews.push(review);

      // TOTAL REVIEWS
      product.numReviews = product.reviews.length;

      // CALCULATE RATING
      product.rating =
        product.reviews.reduce(
          (acc, item) => item.rating + acc,

          0,
        ) / product.reviews.length;

      await product.save();

      res.status(201).json({
        message: 'Review added',
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

// ==============================
// GET SINGLE PRODUCT
// ==============================
router.get(
  '/:id',

  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);

      res.json(product);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

// ==============================
// GET ALL PRODUCTS
// ==============================
router.get(
  '/',

  async (req, res) => {
    try {
      // SEARCH
      const keyword = req.query.search
        ? {
            name: {
              $regex: req.query.search,

              $options: 'i',
            },
          }
        : {};

      // CATEGORY FILTER
      const categoryFilter = req.query.category
        ? {
            category: req.query.category,
          }
        : {};

      // PRICE FILTER
      const priceFilter = {};

      if (req.query.minPrice) {
        priceFilter.price = {
          ...priceFilter.price,

          $gte: Number(req.query.minPrice),
        };
      }

      if (req.query.maxPrice) {
        priceFilter.price = {
          ...priceFilter.price,

          $lte: Number(req.query.maxPrice),
        };
      }

      // PAGINATION
      const pageSize = 6;

      const page = Number(req.query.page) || 1;

      // TOTAL COUNT
      const count = await Product.countDocuments({
        ...keyword,

        ...categoryFilter,

        ...priceFilter,
      });

      // PRODUCTS
      const products = await Product.find({
        ...keyword,

        ...categoryFilter,

        ...priceFilter,
      })

        .limit(pageSize)

        .skip(pageSize * (page - 1))

        .sort({
          createdAt: -1,
        });

      res.json({
        products,

        page,

        pages: Math.ceil(count / pageSize),
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

// ==============================
// DELETE PRODUCT
// ==============================
router.delete(
  '/:id',

  protect,
  adminOnly,

  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          message: 'Product not found',
        });
      }

      await product.deleteOne();

      res.json({
        message: 'Product deleted',
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

// ==============================
// UPDATE PRODUCT
// ==============================
router.put(
  '/:id',

  protect,
  adminOrModerator,

  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          message: 'Product not found',
        });
      }

      product.name = req.body.name || product.name;

      product.images = req.body.images || product.images;

      product.price = req.body.price ?? product.price;

      product.salePrice = req.body.salePrice;

      product.shortDesc = req.body.shortDesc || product.shortDesc;

      product.fullDesc = req.body.fullDesc || product.fullDesc;

      product.category = req.body.category || product.category;

      product.stock = req.body.stock ?? product.stock;

      product.hasVariants = req.body.hasVariants ?? product.hasVariants;

      product.variants = req.body.variants || product.variants;

      const updatedProduct = await product.save();

      res.json(updatedProduct);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  },
);

module.exports = router;
