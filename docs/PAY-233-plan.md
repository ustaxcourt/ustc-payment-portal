1. move IAM from the platform to the foundation (all environments)
2. remove from platform state

   1. checkout main
   2. for each environment:

      1. remove from state the iam for cicd roles

3. import to foundation state
4. broadening the permissions for the lambda exec role so we don't have to attach policies for each epheral environment
