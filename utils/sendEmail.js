const nodemailer = require('nodemailer');

/**
 * Sends an email alert to the admin about a new order.
 * @param {Object} order - The created order document populated with details.
 */
const sendNewOrderAlert = async (order) => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = Number(process.env.EMAIL_PORT) || 465;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const receiver = process.env.EMAIL_RECEIVER || user;

  // If email configuration is missing, print warning and return safely (don't crash the server)
  if (!user || !pass) {
    console.log('\x1b[33m%s\x1b[0m', '[SMTP Notice] EMAIL_USER and EMAIL_PASS are not configured in .env. Order alert email skipped.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // True for 465, false for 587
      auth: {
        user,
        pass,
      },
    });

    const orderItemsHtml = order.orderItems
      .map(
        (item) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">
          ${item.name} ${item.variantName ? `(${item.variantName})` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
          ${item.qty}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          ৳${item.price}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">
          ৳${item.price * item.qty}
        </td>
      </tr>`
      )
      .join('');

    const invoiceNo = order._id.toString().slice(-8).toUpperCase();
    const orderDate = new Date(order.createdAt).toLocaleString('bn-BD');

    const mailOptions = {
      from: `"Nus Haat Store" <${user}>`,
      to: receiver,
      subject: `🚨 New Order Received! Invoice #${invoiceNo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <div style="background-color: #143D60; color: white; padding: 25px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 900;">Nus Haat</h1>
            <p style="margin: 5px 0 0 0; font-size: 13px; color: #A0C878; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
              New Order Notification
            </p>
          </div>
          
          <!-- Content Body -->
          <div style="padding: 25px; color: #334155; line-height: 1.5;">
            <h2 style="color: #0f172a; margin-top: 0; font-size: 18px; border-bottom: 2px solid #f1f5f9; pb-8px; padding-bottom: 8px;">Order Details</h2>
            <p style="margin: 8px 0;"><strong>Invoice No:</strong> #${invoiceNo}</p>
            <p style="margin: 8px 0;"><strong>Date:</strong> ${orderDate}</p>
            <p style="margin: 8px 0;"><strong>Payment Method:</strong> ${order.paymentMethod ? order.paymentMethod.toUpperCase() : 'N/A'}</p>
            
            <!-- Shipping Details -->
            <h3 style="color: #143D60; margin: 20px 0 10px 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">
              Customer Info & Shipping Address
            </h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${order.shippingAddress?.fullName}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${order.shippingAddress?.phone}</p>
            ${order.shippingAddress?.alternativePhone ? `<p style="margin: 5px 0;"><strong>Alt Phone:</strong> ${order.shippingAddress.alternativePhone}</p>` : ''}
            <p style="margin: 5px 0;"><strong>Address:</strong> ${order.shippingAddress?.address}</p>
            <p style="margin: 5px 0;"><strong>Location:</strong> ${order.shippingAddress?.thana}, ${order.shippingAddress?.district}, ${order.shippingAddress?.division || ''}</p>
            ${order.shippingAddress?.courier ? `<p style="margin: 5px 0;"><strong>Courier:</strong> ${order.shippingAddress.courier}</p>` : ''}
            
            <!-- Items Table -->
            <h3 style="color: #143D60; margin: 25px 0 10px 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">
              Items List
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #f8fafc; color: #64748b; font-weight: bold; border-bottom: 2px solid #e2e8f0;">
                  <th style="padding: 10px; text-align: left;">Product</th>
                  <th style="padding: 10px; text-align: center; width: 50px;">Qty</th>
                  <th style="padding: 10px; text-align: right; width: 80px;">Price</th>
                  <th style="padding: 10px; text-align: right; width: 100px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${orderItemsHtml}
              </tbody>
            </table>
            
            <!-- Invoice Totals -->
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; font-size: 13px; margin-top: 15px; border: 1px solid #f1f5f9;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #64748b;">Subtotal:</span>
                <span style="font-weight: bold;">৳${order.totalPrice - (order.deliveryCharge || 0) + (order.couponDiscount || 0) + (order.referralDiscount || 0) - (order.codCharge || 0)}</span>
              </div>
              ${order.couponDiscount > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #e11d48;">
                <span>Coupon Discount:</span>
                <span>-৳${order.couponDiscount}</span>
              </div>` : ''}
              ${order.referralDiscount > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #4f46e5;">
                <span>Referral Discount:</span>
                <span>-৳${order.referralDiscount}</span>
              </div>` : ''}
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #64748b;">Delivery Charge:</span>
                <span style="font-weight: bold;">৳${order.deliveryCharge || 0}</span>
              </div>
              ${order.codCharge > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #64748b;">COD Charge:</span>
                <span style="font-weight: bold;">৳${order.codCharge}</span>
              </div>` : ''}
              <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 15px; font-weight: bold; color: #143D60;">
                <span>Grand Total:</span>
                <span>৳${order.totalPrice}</span>
              </div>
            </div>
            
            ${order.notes ? `
            <div style="margin-top: 20px; padding: 12px; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px;">
              <strong style="color: #b45309; font-size: 12px; display: block; text-transform: uppercase;">Customer Notes:</strong>
              <p style="margin: 5px 0 0 0; font-size: 13px; color: #78350f; font-style: italic;">"${order.notes}"</p>
            </div>` : ''}
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            This is an automated order alert sent to you by the Nus Haat system.
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP Success] Order notification email sent to ${receiver}. Message ID: ${info.messageId}`);
  } catch (error) {
    console.error('[SMTP Error] Failed to send order notification email:', error);
  }
};

module.exports = {
  sendNewOrderAlert,
};
