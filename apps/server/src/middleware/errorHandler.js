import { ZodError } from "zod";
export const globalErrorHandler = (err, req, res, _next) => {
    const cause = err && typeof err === "object" && "cause" in err
        ? err.cause
        : undefined;
    console.error(`[Error] ${req.method} ${req.path}:`, {
        name: err.name,
        message: err.message,
        cause,
    });
    if (err instanceof ZodError) {
        return res.status(400).json({
            error: "Validation Failed",
            details: err.flatten(),
        });
    }
    return res.status(500).json({
        error: "Internal Server Error",
        message: process.env.NODE_ENV === "development"
            ? err.message
            : "Unexpected failure while processing request.",
    });
};
//# sourceMappingURL=errorHandler.js.map