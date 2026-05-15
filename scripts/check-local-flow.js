const crypto = require('node:crypto');

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function ensureOk(response, label) {
  if (!response.ok) {
    const body = await parseResponseBody(response);
    throw new Error(
      `${label} failed: ${response.status} ${response.statusText} - ${typeof body === 'string' ? body : JSON.stringify(body)}`
    );
  }
}

function parseToken(initResponseBody) {
  if (typeof initResponseBody.token === 'string' && initResponseBody.token.length > 0) {
    return initResponseBody.token;
  }

  if (typeof initResponseBody.paymentRedirect === 'string') {
    const redirectUrl = new URL(initResponseBody.paymentRedirect);
    const redirectToken = redirectUrl.searchParams.get('token');
    if (redirectToken) {
      return redirectToken;
    }
  }

  throw new Error('Could not determine token from /init response');
}

async function main() {
  const apiPort = process.env.API_PORT || '8080';
  const paymentPort = process.env.PAY_GOV_TEST_SERVER_PORT || '3366';
  const baseUrl = process.env.BASE_URL || `http://localhost:${apiPort}`;
  const paymentBase = process.env.PAYMENT_URL || `http://localhost:${paymentPort}/pay`;
  const feeId = process.env.FEE_ID || 'PETITION_FILING_FEE';
  const metadata =
    feeId === 'NONATTORNEY_EXAM_REGISTRATION_FEE'
      ? {
          email: 'applicant@example.com',
          fullName: 'Local Flow Check',
          accessCode: 'LOCALFLOW',
        }
      : { docketNumber: '123-26' };
  const initUrl = new URL('/init', baseUrl).toString();

  const initPayload = {
    transactionReferenceId: crypto.randomUUID(),
    feeId,
    urlSuccess: 'https://client.app/success',
    urlCancel: 'https://client.app/cancel',
    metadata,
  };

  console.log(`[check:local-flow] POST ${initUrl}`);
  const initResponse = await fetch(initUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(initPayload),
  });
  await ensureOk(initResponse, '/init');

  const initBody = await initResponse.json();
  const token = parseToken(initBody);
  const payUrl = new URL(paymentBase);
  payUrl.searchParams.set('token', token);

  console.log(`[check:local-flow] GET ${payUrl.toString()}`);
  const payResponse = await fetch(payUrl.toString(), {
    method: 'GET',
    headers: { accept: 'text/html' },
  });
  await ensureOk(payResponse, '/pay');

  const payHtml = await payResponse.text();
  if (!payHtml || !payHtml.toLowerCase().includes('<html')) {
    throw new Error('/pay did not return HTML content');
  }

  console.log('[check:local-flow] Success: /init and /pay token flow validated.');
}

main().catch(error => {
  console.error('[check:local-flow] Failed:', error.message);
  process.exit(1);
});
