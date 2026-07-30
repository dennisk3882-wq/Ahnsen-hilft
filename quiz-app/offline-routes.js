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
  return catalogService.versionFor(catalogService.currentCatalogs());
}

function installOfflineRoutes(app) {
  app.get('/api/offline/catalog', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json({
      version: catalogVersion(),
      generatedAt: Date.now(),
      catalogs: {
        adult: catalogService.currentCatalog('adult').map(publicQuestion),
        child: catalogService.currentCatalog('child').map(publicQuestion),
      },
    });
  });
}

module.exports = { installOfflineRoutes, catalogVersion };
