const express = require('express');
const { getDb } = require('./utils/db');
const { draftCopy } = require('./utils/listingCopy');
const { cardWithSellable } = require('./listings');

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({ connected: Boolean(process.env.ANTHROPIC_API_KEY) });
});

router.post('/draft-listing', async (req, res) => {
  const db = getDb();
  const info = await cardWithSellable(db, req.body.cardId);
  if (!info) return res.status(404).json({ error: 'Card not found' });
  const fallback = draftCopy(info.card, info.summary.sellable);

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ ...fallback, source: 'template' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
    const message = await client.messages.create({
      model,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Write a marketplace listing. Return JSON only: {"extractedData":{"name":"","set":"","rarity":"","sellable":0},"listing":{"title":"","description":""}}.
Card: ${info.card.name} set ${info.card.set_code} #${info.card.number} rarity ${info.card.rarity} sellable ${info.summary.sellable}.
Do not invent extra quantity. Facts first, listing second.`,
      }],
    });
    const text = message.content[0] && message.content[0].text;
    const parsed = JSON.parse(text.replace(/^```json|```$/g, '').trim());
    res.json({
      title: parsed.listing.title,
      description: parsed.listing.description,
      extractedData: parsed.extractedData,
      source: 'claude',
    });
  } catch (err) {
    res.json({ ...fallback, source: 'template', error: err.message });
  }
});

module.exports = router;
