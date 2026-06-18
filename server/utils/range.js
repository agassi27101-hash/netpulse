const RANGE_MODIFIERS = {
  '1h': '-1 hours',
  '6h': '-6 hours',
  '24h': '-24 hours',
  '7d': '-7 days',
  '30d': '-30 days'
};

function rangeToModifier(range) {
  return RANGE_MODIFIERS[range] || RANGE_MODIFIERS['24h'];
}

module.exports = { rangeToModifier };
