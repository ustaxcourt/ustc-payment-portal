import { CompleteOnlineCollectionRequest } from "./CompleteOnlineCollectionRequest";

describe('CompleteOnlineCollectionRequest', () => {
  describe('validate', () => {
    it('does not throw an error when the the request has all of the required information', async () => {
      const obj = new CompleteOnlineCollectionRequest({
        tcs_app_id: 'foo',
        token: 'bar'
      })

      await expect(obj.validate()).resolves.not.toThrow();

    });

    it('throws an error when the entity is missing a token', async () => {
      const obj = new CompleteOnlineCollectionRequest({
        tcs_app_id: 'foo',
      })

      await expect(obj.validate()).rejects.toThrow("\"token\" is required");
    });

    it('throws an error when the entity is missing the tcs_app_id', async () => {
      const obj = new CompleteOnlineCollectionRequest({
        token: 'foo',
      })

      await expect(obj.validate()).rejects.toThrow("\"tcs_app_id\" is required");
    });
  });

});