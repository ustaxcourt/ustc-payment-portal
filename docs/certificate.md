# Creating the Pay.gov certificates

## TCS Certificate Retrieval

Before you begin, be sure to have the Reference Number and Authorization Code provided by the Fiscal Service team. The reference number should be provided by Email and the Authorization Code should be provided by Phone (for Production).

Using the Microsoft Edge browser (not compatible with Firefox), access the appropriate environment retrieval site:

- QA/Test: https://api-preprod.fiscal.treasury.gov/ap/acc/exp/v1/service-security/web
- Production: https://api.fiscal.treasury.gov/ap/exp/v1/service-security/web

1. Access the retrieval link for the appropriate environment.

2. Generate and safely store a secure Keystore Password.

3. Enter the Reference Number (provided via email), Authorization Code (provided via phone), and Keystore Password (self-generated). Keystore Format leave as PKCS12. Click Get my Certificate.

4. Download the Truststore PKCS12 file that was generated.

## Generating certificates for performing requests to Pay.gov

To convert a .p12 certificate file to PEM format, you can use OpenSSL. Here's how you can convert a .p12 file to separate .pem files for the private key and the certificate:

1. Install OpenSSL: If you don't have OpenSSL installed, you can download it from the official website and follow the installation instructions for your operating system.

2. Open a command prompt or terminal window.

3. Navigate to the directory where the OpenSSL executable is located. If OpenSSL is installed correctly and added to the system's PATH environment variable, you can skip this step.

4. Run the following command to convert the .p12 file to a .pem file containing the private key:

   ```
   openssl pkcs12 -in certificate.p12 -nocerts -out privatekey.pem -nodes
   ```

   Replace `certificate.p12` with the actual filename of your .p12 certificate file. The `-nocerts` flag indicates that only the private key should be extracted. The `-out privatekey.pem` flag specifies the output filename for the private key file. The `-nodes` flag ensures that the private key is not encrypted with a passphrase. If you want to encrypt the private key with a passphrase, you can omit the `-nodes` flag.

5. OpenSSL will prompt you to enter the import password for the .p12 file. Enter the password associated with the .p12 certificate.

6. After successful execution, OpenSSL will create a private key file (`privatekey.pem` in the example command).

7. Run the following command to extract the certificate from the .p12 file into a separate .pem file:

   ```
   openssl pkcs12 -in certificate.p12 -clcerts -nokeys -out certificate.pem
   ```

   Replace `certificate.p12` with the actual filename of your .p12 certificate file. The `-clcerts` flag indicates that only the client certificate should be extracted. The `-nokeys` flag indicates that no private key should be included in the output. The `-out certificate.pem` flag specifies the output filename for the certificate file.

8. OpenSSL will prompt you to enter the import password for the .p12 file. Enter the password associated with the .p12 certificate.

9. After successful execution, OpenSSL will create a certificate file (`certificate.pem` in the example command).

Now you have two separate .pem files: `privatekey.pem` containing the private key and `certificate.pem` containing the certificate extracted from the .p12 file.

## Using generated .pem certificates

Depending on which environments the certificates are to be used, you will need to move them to the appropriate location so that they can be deployed to server. Use the following nomenclature for QA and Production:

- Staging (QA):

  - certs/staging-certificate.pem
  - certs/staging-privatekey.pem

- Production:

  - certs/production-certificate.pem
  - certs/production-privatekey.pem

Then wherever environment variables are configured (currently Amplify), you will want to specify the environment of `NODE_ENV` to match the name of the certificate you wish to use (`production` or `staging`).
