'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { enrichQuestion } = require('./question-explanations');

const catalogs = {
  adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')).map(enrichQuestion),
  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')).map(enrichQuestion),
};

function publicQuestion(question) {
  return {
    id: question.id,
    category: question.category,
    text: question.text,
    options: question.options,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
  };
}

function catalogVersion() {
  const hash = crypto.createHash('sha256');
  for (const type of ['adult', 'child']) {
    for (const question of catalogs[type]) {
      hash.update(`${type}:${question.id}:${question.text}:${question.correctIndex}`);
    }
  }
  return hash.digest('hex').slice(0, 16);
}

function installOfflineRoutes(app) {
  app.get('/api/offline/catalog', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      version: catalogVersion(),
      generatedAt: Date.now(),
      catalogs: {
        adult: catalogs.adult.map(publicQuestion),
        child: catalogs.child.map(publicQuestion),
      },
    });
  });
}

module.exports = { installOfflineRoutes, catalogVersion };
