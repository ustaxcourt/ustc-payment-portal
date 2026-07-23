// TEMPORARY — PAY-360 Integration Gate proof. DELETE this file before merging.
// It fails on purpose so pr_build_test_deploy fails and the "Integration Gate"
// required check turns red. Verifies the gate blocks a failing test run.
describe("PAY-360 Integration Gate proof (temporary)", () => {
  it("fails intentionally to verify the gate turns red", () => {
    expect(true).toBe(false);
  });
});
