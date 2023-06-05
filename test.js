const { handler } = require("./index");

handler({ body: "foobar" }).then((res) => console.log(res));
