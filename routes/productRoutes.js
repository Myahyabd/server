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
// GET SEARCH SUGGESTIONS (Autocomplete / Instant Search)
// ==============================
router.get(
  '/search/suggestions',
  async (req, res) => {
    try {
      const query = req.query.q || '';
      if (!query.trim()) {
        const popular = await Product.find({
          $and: [
            {
              $or: [
                { hasVariants: false, stock: { $gt: 0 } },
                { hasVariants: true, 'variants.stock': { $gt: 0 } }
              ]
            },
            {
              $or: [
                { price: { $gt: 0 } },
                { salePrice: { $gt: 0 } }
              ]
            }
          ]
        }).sort({ rating: -1, numReviews: -1 }).limit(6);
        return res.json(popular);
      }

      const regex = new RegExp(query, 'i');
      const products = await Product.find({
        $and: [
          {
            $or: [
              { name: regex },
              { category: regex },
              { shortDesc: regex }
            ]
          },
          {
            $or: [
              { hasVariants: false, stock: { $gt: 0 } },
              { hasVariants: true, 'variants.stock': { $gt: 0 } }
            ]
          },
          {
            $or: [
              { price: { $gt: 0 } },
              { salePrice: { $gt: 0 } }
            ]
          }
        ]
      })
      .select('name images price salePrice rating category')
      .limit(8);

      res.json(products);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ==============================
// GET ALL UNIQUE CATEGORIES
// ==============================
router.get(
  '/categories',

  async (req, res) => {
    try {
      const Order = require('../models/Order');
      const categories = await Product.distinct('category');

      // Get non-cancelled orders to aggregate sales volume
      const orders = await Order.find({ status: { $ne: 'Cancelled' } }).select('orderItems');

      // Map product IDs to their categories
      const products = await Product.find({}).select('category');
      const productCategoryMap = {};
      products.forEach(p => {
        if (p.category) {
          productCategoryMap[p._id.toString()] = p.category;
        }
      });

      // Sum quantities sold for each category
      const salesCounts = {};
      categories.forEach(cat => {
        salesCounts[cat] = 0;
      });

      orders.forEach(order => {
        if (order.orderItems) {
          order.orderItems.forEach(item => {
            const cat = productCategoryMap[item.product?.toString()];
            if (cat && salesCounts[cat] !== undefined) {
              salesCounts[cat] += (item.qty || 0);
            }
          });
        }
      });

      // Sort categories descending by sales volume
      categories.sort((a, b) => salesCounts[b] - salesCounts[a]);

      res.json(categories);
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

  protect.optionalProtect,

  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          message: 'Product not found',
        });
      }

      const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'moderator');
      const isAdminPanel = req.query.adminPanel === 'true' && isStaff;

      // If not fetched in admin panel context and product has no valid price, return 404
      if (!isAdminPanel && (product.price <= 0 && (!product.salePrice || product.salePrice <= 0))) {
        return res.status(404).json({
          message: 'Product not found',
        });
      }

      const productObj = product.toObject();

      if (!isStaff) {
        delete productObj.moderatorPrice;
      }

      res.json(productObj);
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

  protect.optionalProtect,

  async (req, res) => {
    try {
      // SEARCH
      const keyword = req.query.search
        ? {
            $or: [
              {
                name: {
                  $regex: req.query.search,
                  $options: 'i',
                },
              },
              {
                brand: {
                  $regex: req.query.search,
                  $options: 'i',
                },
              },
              {
                keywords: {
                  $regex: req.query.search,
                  $options: 'i',
                },
              },
            ],
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

      const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'moderator');
      const isAdminPanel = req.query.adminPanel === 'true' && isStaff;

      const stockFilter = isAdminPanel
        ? {}
        : {
            $or: [
              { hasVariants: false, stock: { $gt: 0 } },
              { hasVariants: true, 'variants.stock': { $gt: 0 } }
            ]
          };

      const priceValidationFilter = isAdminPanel
        ? {}
        : {
            $or: [
              { price: { $gt: 0 } },
              { salePrice: { $gt: 0 } }
            ]
          };

      // PAGINATION
      const nopage = req.query.nopage === 'true';
      const pageSize = 12;
      const page = Number(req.query.page) || 1;

      // TOTAL COUNT
      const count = await Product.countDocuments({
        ...keyword,
        ...categoryFilter,
        ...priceFilter,
        ...stockFilter,
        ...priceValidationFilter,
      });

      // PRODUCTS
      let query = Product.find({
        ...keyword,
        ...categoryFilter,
        ...priceFilter,
        ...stockFilter,
        ...priceValidationFilter,
      });

      if (!nopage) {
        query = query.limit(pageSize).skip(pageSize * (page - 1));
      }

      const products = await query.sort({
        createdAt: -1,
      });

      const sanitizedProducts = products.map(p => {
        const pObj = p.toObject();
        if (!isStaff) {
          delete pObj.moderatorPrice;
        }
        return pObj;
      });

      res.json({
        products: sanitizedProducts,

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

      product.moderatorPrice = req.body.moderatorPrice;

      product.shortDesc = req.body.shortDesc || product.shortDesc;

      product.fullDesc = req.body.fullDesc || product.fullDesc;

      product.category = req.body.category || product.category;

      product.keywords = req.body.keywords ?? product.keywords;

      product.brand = req.body.brand ?? product.brand;

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

// ==============================
// GET DYNAMIC SITEMAP.XML
// ==============================
router.get('/sitemap/xml', async (req, res) => {
  try {
    // Fetch all products that have a valid price (are not draft/hidden)
    const products = await Product.find({
      $or: [
        { price: { $gt: 0 } },
        { salePrice: { $gt: 0 } }
      ]
    }).select('_id updatedAt');

    const categories = await Product.distinct('category', {
      $or: [
        { price: { $gt: 0 } },
        { salePrice: { $gt: 0 } }
      ]
    });

    const domain = 'https://nushaat.com'; // Default domain

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static main urls
    const staticPages = [
      { path: '/', priority: '1.0', changefreq: 'daily' },
      { path: '/shop', priority: '0.9', changefreq: 'daily' },
      { path: '/cart', priority: '0.7', changefreq: 'monthly' }
    ];

    staticPages.forEach(p => {
      xml += `  <url>\n`;
      xml += `    <loc>${domain}${p.path}</loc>\n`;
      xml += `    <changefreq>${p.changefreq}</changefreq>\n`;
      xml += `    <priority>${p.priority}</priority>\n`;
      xml += `  </url>\n`;
    });

    // Category pages
    categories.forEach(cat => {
      xml += `  <url>\n`;
      xml += `    <loc>${domain}/shop?category=${encodeURIComponent(cat)}</loc>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    });

    // Product detail pages
    products.forEach(p => {
      xml += `  <url>\n`;
      xml += `    <loc>${domain}/product/${p._id}</loc>\n`;
      xml += `    <lastmod>${new Date(p.updatedAt).toISOString().split('T')[0]}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    });

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==============================
// GET ROBOTS.TXT
// ==============================
router.get('/robots/txt', async (req, res) => {
  const domain = 'https://nushaat.com';
  let robots = `User-agent: *\n`;
  robots += `Allow: /\n`;
  robots += `Disallow: /admin/\n`;
  robots += `Disallow: /moderator/\n`;
  robots += `Sitemap: ${domain}/api/products/sitemap/xml\n`;

  res.header('Content-Type', 'text/plain');
  res.send(robots);
});

module.exports = router;
