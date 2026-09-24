// Canonical authentication encoding used by the existing operator template.
export const passkeyAuthenticationScript = `
      function decodeAuthenticationOptions(options) {
        return {
          ...options,
          challenge: base64UrlToBuffer(options.challenge),
          allowCredentials: Array.isArray(options.allowCredentials)
            ? options.allowCredentials.map((item) => ({
                ...item,
                id: base64UrlToBuffer(item.id)
              }))
            : []
        };
      }

      function encodeAuthenticationAssertion(assertion) {
        return {
          id: assertion.id,
          rawId: bufferToBase64Url(assertion.rawId),
          type: assertion.type,
          response: {
            authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
            clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
            signature: bufferToBase64Url(assertion.response.signature),
            userHandle: assertion.response.userHandle
              ? bufferToBase64Url(assertion.response.userHandle)
              : null
          }
        };
      }

      function base64UrlToBuffer(value) {
        const base64 = String(value)
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(String(value).length / 4) * 4, "=");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      }

      function bufferToBase64Url(buffer) {
        const bytes = new Uint8Array(buffer);
        let text = "";
        for (const byte of bytes) {
          text += String.fromCharCode(byte);
        }
        return btoa(text).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      }
`;
