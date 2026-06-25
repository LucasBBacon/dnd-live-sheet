// Higher order func to inject auth provider dependency
export const createAuthMiddleware = (provider) => {
    return async (req, res, next) => {
        try {
            const user = await provider.authenticate(req);
            if (!user) {
                return res.status(401).json({ error: "Unauthorized request" });
            }
            req.user = user;
            return next();
        }
        catch (error) {
            console.error("Auth pipeline failure:", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    };
};
//# sourceMappingURL=requireAuth.js.map