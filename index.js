module.exports.handler = async (event, context) => {
  try {
    console.log("init");
    const res = await fetch("https://api.ipify.org");
    console.log("request made");
    const body = await res.text();
    console.log(body);

    return {
      statusCode: 200,
      body,
    };
  } catch (error) {
    // Handle any errors that occur
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

module.exports.initPayment = async (event, context) => {
  try {
    console.log("init");
    const res = await fetch("https://api.ipify.org");
    console.log("request made");
    const body = await res.text();
    console.log(body);

    return {
      statusCode: 200,
      body,
    };
  } catch (error) {
    // Handle any errors that occur
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
