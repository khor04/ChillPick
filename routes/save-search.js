const express = require("express");
const router = express.Router();
const UserInteraction = require("../models/SavedSearch");

router.post("/save", async (req, res) => {
  try {

    // Always attribute to the logged-in user - a userId in the body is ignored,
    // otherwise anyone could write into (and skew) another user's history.
    const userId = req.session?.userId;
    const { userId: _ignored, interactionType, ...data } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Please log in to save interactions",
      });
    }

    // Validate interaction type
    const validTypes = [
      "search",
      "filter genre",
      "filter rating",
      "add to watchlist",
      "item clicked",
      "like",
      "reply",
    ];
    if (!validTypes.includes(interactionType)) {
      console.error("❌ Invalid interaction type:", interactionType);
      return res.status(400).json({
        success: false,
        error: "Invalid interaction type",
        validTypes,
      });
    }

    // Create interaction object
    const interactionData = {
      userId,
      interactionType,
      timestamp: new Date(),
    };

    // Add type-specific data based on interaction type
    switch (interactionType) {
      case "search":
        if (!data.query) {
          return res.status(400).json({
            success: false,
            error: "Query is required for search interactions",
          });
        }
        interactionData.query = data.query;
        break;

      case "filter genre":
        if (!data.genre) {
          return res.status(400).json({
            success: false,
            error: "Genre is required for genre filter interactions",
          });
        }
        interactionData.genre = data.genre;
        break;

      case "filter rating":
        if (!data.rating) {
          return res.status(400).json({
            success: false,
            error: "Rating is required for rating filter interactions",
          });
        }
        interactionData.rating = data.rating;
        break;

      case "add to watchlist":
        if (!data.itemDetails) {
          return res.status(400).json({
            success: false,
            error: "Item details are required for watchlist interactions",
          });
        }
        // interactionData.itemDetails = data.itemDetails;
        // Include genres in itemDetails
        interactionData.itemDetails = {
          id: data.itemDetails.id,
          title: data.itemDetails.title,
          rating: data.itemDetails.rating,
          image: data.itemDetails.image,
          type: data.itemDetails.type,
          detailURL: data.itemDetails.detailURL,
          genres: data.itemDetails.genres || [], 
        };
        break;

      case "item clicked":
        if (!data.clickedItem) {
          return res.status(400).json({
            success: false,
            error:
              "Clicked item details are required for item click interactions",
          });
        }
        // interactionData.clickedItem = data.clickedItem;
        interactionData.clickedItem = {
          id: data.clickedItem.id,
          title: data.clickedItem.title,
          type: data.clickedItem.type,
          genres: data.clickedItem.genres || [],
        };
        break;
    }

    // Save to database
    const interaction = new UserInteraction(interactionData);
    const savedInteraction = await interaction.save();

    res.status(201).json({
      success: true,
      message: "Interaction saved successfully",
      data: {
        id: savedInteraction._id,
        userId: savedInteraction.userId,
        interactionType: savedInteraction.interactionType,
        timestamp: savedInteraction.timestamp,
      },
    });
  } catch (err) {
    console.error("❌ Error saving interaction:", err.message);

    // Handle validation errors specifically
    if (err.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: err.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: err.message,
    });
  }
});

module.exports = router;
