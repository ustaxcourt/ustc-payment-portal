"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppContext = void 0;
const initPayment_1 = require("./useCases/initPayment");
const createAppContext = () => {
    return {
        getUseCases: () => ({
            initPayment: initPayment_1.initPayment,
        }),
    };
};
exports.createAppContext = createAppContext;
