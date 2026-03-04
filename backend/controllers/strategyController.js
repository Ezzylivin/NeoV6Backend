// File: src/controllers/helpCenterController.js
import SupportTicket from "../dbStructure/supportTicket.js"; 

// 🟢 1. Submit a Support Ticket
export const submitTicket = async (req, res) => {
  try {
    const { subject, category, message } = req.body;
    const ticket = await SupportTicket.create({ 
      userId: req.user._id, 
      subject, category, message, status: 'open' 
    });
    res.status(201).json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ message: "Failed to submit request" });
  }
};

// 🟢 2. Get Dynamic FAQs
export const getFaqs = async (req, res) => {
  const faqs = [
    { category: "Neural Link", q: "Why did my link sever?", a: "Connections drop due to inactivity or Render sleep cycles." },
    { category: "Risk", q: "What is Max Pyramiding?", a: "It limits concurrent positions for a single trend." }
  ];
  res.json(faqs);
};

// 🟢 3. Get System Health
export const getStatus = async (req, res) => {
  res.json({ engine: "OPERATIONAL", latency: "42ms", timestamp: new Date() });
};
