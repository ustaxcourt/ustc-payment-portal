# AWS Lambda Power Tuner

If you are here, it means that one of our primary lambda functions has changed enough in purpose that we need to resize it for speed and cost again.

## How does it work?

The Power Tuner works by spinning up a stateMachine on Cloud Formation, who's step functions spin up versions of our Lambda functions at different memory sizes, then run a small load test against each one to get an average invocation time and cost. It then uses the average time and cost to recommend the best size to give each of our functions. You can read more about how it works in the [Power Tuning README.](https://github.com/alexcasalboni/aws-lambda-power-tuning).

## How do we use it in Payment Portal?

You can trigger a tuning run by manually triggering the `Power Tuning (Dev)` workflow on GitHub Actions. You can find it under `.github/workflows/power-tuning-dev.yml`.

1. Select the workflow, and choose which functions you want to be tested: `initPayment`, `processPayment`, `getDetails`, `testCert`, `healthCheck`, or `ALL`. Note that select ALL will run the tuner for all 5 our primary functions.
2. Next enter the number of invocations you want each function to run. **100 is the max number of invocations per function per size that can be run.** If left empty it will default to 10 per function per memory size.
3. Next select the memory sizes you want to test against. If you leave this input blank it will default to `128,256,512,768,1024,1536`. Unless you want to test only a few sizes lower than 1536 MB, leave this blank and stick with the default.
4. Hit run. All that's left is to wait for the results. The tuner will run through each function sequentially, hitting each function N number times (whatever you set the num value to in step 2). When it's done the workflow will report green and give you an artifact with a file called `power-tuning-results.json`.
5. View the results, the file will contain JSON objects for each of the functions you tuned, looking like this:

```json
{
  "power": "1024",
  "cost": 0.0000002083,
  "duration": 412.67,
  "stateMachine": {
    "executionCost": 0.00045,
    "lambdaCost": 0.0122917,
    "visualization": "https://lambda-power-tuning.show/#gAAAAABk...=="
  }
}
```
**Legend**
- **Power:** Recommended memory size calculated from the tuner run.
- **cost:** How much on average, per invoke the given function at the recommended memory size will cost to run.
- **executionCost:** The AWS Step Functions cost of running the state machine for this tuning execution. It's described as a "fixed value for the worst case" (i.e. a conservative upper-bound estimate of the state transitions, not metered/actual usage).
- **lambdaCost:** The AWS Lambda cost of all the invocations this tuning run made against your target function while testing each power value (num invocations × however many power values × the average duration at each).
- **visualization:** URL to view a graph plotting the function's average invocation time and cost across the memory sizes tested.
