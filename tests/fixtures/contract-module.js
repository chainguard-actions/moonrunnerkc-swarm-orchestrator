// Minimal contract module fixture for test-patches-and-module.yml
// Default export is a contract object consumed by the deterministic extractor.
module.exports = {
  goal: "write a hello world function",
  obligations: [
    {
      id: "ob-001",
      description: "Implement a hello() function that returns 'hello world'",
      verifier: "unit-test"
    }
  ]
};
