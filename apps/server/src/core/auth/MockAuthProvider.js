export class MockAuthProvider {
    async authenticate(req) {
        // trust the header for testing...
        const testerId = req.headers["x-tester-id"];
        if (typeof testerId !== "string") {
            return null;
        }
        return { id: testerId };
    }
}
//# sourceMappingURL=MockAuthProvider.js.map