# AWS Lambda Power Tuner

If you are here, it means that one of our primary lambda functions has changed enough in purpose that we need to resize it for speed and cost again.

## How does it work?

The Power Tuner works by spinning up a stateMachine on Cloud Formation, who's step functions spin up versions of our Lambda functions at different memory sizes, then run a small load test against each one to get an average invocation time and cost. It then uses the average time and cost to recommend the best size to give each of our functions.

![stateMachine Diagram for Lambda Power Tuning](/docs/diagrams/state-machine-screenshot.png)

The stateMachine is made up 5 lambda functions, the **Initializer, Publisher, isCountReached, Executor, Cleaner, Analyzer, and Optimizer.**

### Initializer
The is our first stop, where versions and aliases are defined for each of the functions we are tuning. We will need these to keep track of which function is which at each memory size. The aliases will come into play later when we clean up from a tuning run. **This gets run once per tuning run.**

### Publisher
This is where the versions and aliases defined in the Initializer are now created. **This function gets invoked in a loop, until all of the needed function versions and aliases are created.** After this function has run, each of the functions being tuned now exist at each of the memory sizes choosen at the start of the tuning run.

### Executor
Third is the **Executor** function, where each of the functions we are tuning ar run **N** times as defined by the `num` value. This is also where we **extract invocation time from the logs and compute average invoke cost for each function/memory size.** The Executor function can also be invoked in parallel, for however many memory sizes were chosen at the start of the run. The `power-tuning-dev` workflow sets `parallelInvocation: true`. If it's set to false, the **Executor** will invoke each function version sequentially. One thing to note though, the Executor funciton is split into 3 steps, preProcessors, invoking the function we are tuning, and postProcessors.

#### Pre-Processor Functions

These are optional functions we can create to run prior the functions we are actually testing. In Payment Portal's case, we have two, `initRefGenerator.ts` and `processTokenMinter.ts`. You will need to build them out like normal lambda functions, making sure they are defined in `power-tuning-preprocessors.tf`

##### initRefGenerator

This gets run before tuning **initPayment,** taking in our test request body, refreshing the `transactionReferenceId` for each invoke of **initPayment.**

##### processTokenMinter

This preProcessor function runs before **processPayment** gets invoked by the tuner, running **initPayment** once so that we have a valid token.

#### Post-Processor Functions

Optional functions we can create to run after each invoke. If a specific function run needs cleanup (removing test data and etc), schema validation (making sure the response is what we expect), or a fallback trigger, you would do that here.

### CleanUpOnError

Runs if something goes wrong on initialization or execution. Deletes temporary aliases and versions, same as **Cleanup.**

### CleanUp

 This is where the stateMachine deletes any previously generated aliases and versions from the tuning run. The Cleaner is only run once at the end.

### Analyzer

This is where we take the invocation time and average invocation cost from each of the functions run through the Executor, calculating the recommended size for each function. **It will recommend the memory size with the lowest average cost per invocation.**

### Optional: Optimizer

If you set `autoOptimize` to true, the Optimizer function will run. This will automatically update each of the functions tuned to their optimal memory size based on the run.

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
