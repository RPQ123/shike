/* Product rule: all counters serve substitutable meals, with no grade restriction.
 * Keep the historical engine and study inputs intact; convert only working copies.
 * Expected residual + (queued people + oneself) * mean service estimates pickup completion.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./school-engine.js'));
  else root.DiningCommonWindows = factory(root.CanteenSim);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  function normalize(input) {
    return E.normalizeSchoolConfig({
      ...input,
      serviceZones: null,
      windowZones: null,
      gradeZoneWeights: null,
      seatPoolByZone: null,
      allocation: 'shared',
      strategy: 'fastest'
    });
  }
  return Object.freeze({ normalize });
});
