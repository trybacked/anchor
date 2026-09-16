import type { ApiError } from "./types.js";

export class AnchorClientError extends Error {
    override readonly name = "AnchorClientError";

    constructor(
        message: string,
        readonly status: number,
        readonly code?: string,
        readonly body?: ApiError,
    ) {
        super(message);
    }

    static fromApiError(body: ApiError, status: number, fallbackMessage = "Request failed"): AnchorClientError {
        return new AnchorClientError(body.message ?? fallbackMessage, status, body.error, body);
    }

    static async fromResponse(response: Response, fallbackMessage = "Request failed"): Promise<AnchorClientError> {
        const body = (await response.json().catch(() => undefined)) as ApiError | undefined;
        if (body !== undefined) {
            return AnchorClientError.fromApiError(body, response.status, fallbackMessage);
        }
        return new AnchorClientError(fallbackMessage, response.status);
    }
}

export function assertApiSuccess<T>(
    data: T | undefined,
    error: unknown,
    response: Response,
): T {
    if (error !== undefined) {
        throw AnchorClientError.fromApiError(error as ApiError, response.status);
    }
    if (data === undefined) {
        throw new AnchorClientError("Empty response body.", response.status);
    }
    return data;
}
