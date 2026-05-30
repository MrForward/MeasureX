import { NextResponse } from 'next/server';

/**
 * Consistent API response envelope.
 * Success: { data: T, error: null }
 * Failure: { data: null, error: { message: string, code: string } }
 */

export interface ApiSuccessResponse<T> {
    data: T;
    error: null;
}

export interface ApiErrorResponse {
    data: null;
    error: {
        message: string;
        code: string;
    };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Returns a NextResponse with the success envelope.
 * @param data    - The payload to return.
 * @param status  - HTTP status code (default 200).
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
    return NextResponse.json({ data, error: null }, { status });
}

/**
 * Returns a NextResponse with the error envelope.
 * @param message - Human-readable error description.
 * @param code    - Machine-readable error code (e.g. "UNAUTHORIZED", "NOT_FOUND").
 * @param status  - HTTP status code.
 */
export function apiError(
    message: string,
    code: string,
    status: number,
): NextResponse<ApiErrorResponse> {
    return NextResponse.json({ data: null, error: { message, code } }, { status });
}
