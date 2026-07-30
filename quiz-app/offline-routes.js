'use strict';

const catalogService = require('./question-catalog-service');

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
  return catalogService.versionFor({
    adult: catalogService.canonicalCatalog('adult'),
    child: catalogService.canonicalCatalog('child'),
  });
}

function installOfflineRoutes(app) {
  app.get('/api/offline/catalog', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      version: catalogVersion(),
      generatedAt: Date.now(),
      catalogs: {
        adult: catalogService.canonicalCatalog('adult').map(publicQuestion),
        child: catalogService.canonicalCatalog('child').map(publicQuestion),
      },
    });
  });
}

module.exports = { installOfflineRoutes, catalogVersion };
