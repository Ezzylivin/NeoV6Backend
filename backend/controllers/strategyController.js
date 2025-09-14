import Strategy from "../dbStructure/strategy.js";

const sendError = (res, err, status = 500) => {
    console.error(err);
    res.status(status).json({ message: err.message });
};

export const createStrategy = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, params } = req.body;
    if (!name || !params) return res.status(400).json({ message: "Missing required fields" });
    
    const newStrategy = await Strategy.create({ userId, name, description, params });
    res.status(201).json(newStrategy);
  } catch(err) {
    sendError(res, err);
  }
};

export const updateStrategy = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, params } = req.body;

    const updatedStrategy = await Strategy.findOneAndUpdate(
      { _id: id, userId: userId }, // Ensure user owns this strategy
      { name, description, params },
      { new: true, runValidators: true } // Return the updated document
    );

    if (!updatedStrategy) return res.status(404).json({ message: "Strategy not found or you do not have permission to edit it" });
    
    res.status(200).json(updatedStrategy);
  } catch(err) {
    sendError(res, err);
  }
};

export const getUserStrategies = async (req, res) => {
  try {
    const strategies = await Strategy.find({ userId: req.user.id });
    res.status(200).json(strategies);
  } catch (err) {
    sendError(res, err);
  }
};

export const deleteStrategy = async (req, res) => {
  try {
    const result = await Strategy.deleteOne({ _id: req.params.id, userId: req.user.id });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Strategy not found or you do not have permission to delete it" });
    res.status(200).json({ message: "Strategy deleted" });
  } catch (err) {
    sendError(res, err);
  }
};
