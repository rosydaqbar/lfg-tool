function createDebugLogger(enabled) {
  return (...args) => {
    if (enabled) console.log(...args);
  };
}

module.exports = { createDebugLogger };
