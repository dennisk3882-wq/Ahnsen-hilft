'use strict';
const shared = require('./phase12-shared');
const legal = require('./phase12-legal-storage');
const quality = require('./phase12-quality-storage');
const operations = require('./phase12-operations');
const engagement = require('./phase13-storage');
module.exports = { ...shared, ...legal, ...quality, ...operations, ...engagement, _test: { berlinDate: shared.berlinDate, mondayFor: shared.mondayFor, dateDiffDays: shared.dateDiffDays, resolveQuestion: quality.resolveQuestion } };
