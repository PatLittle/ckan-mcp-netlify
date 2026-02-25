export const createTextPrompt = (text) => ({
    messages: [
        {
            role: "user",
            content: {
                type: "text",
                text
            }
        }
    ]
});
