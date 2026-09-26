import Foundation
import Supabase

/// A failed request, with the database's own words.
///
/// RPCs raise a Dutch sentence meant for people (`message`) and, on newer
/// functions, a stable key in `hint` ("user_not_found", …) for code.
struct APIError: LocalizedError {
    let message: String
    let hint: String?

    var errorDescription: String? { message }

    static let notConfigured = APIError(message: "De app weet niet met welke server hij moet praten.", hint: "not_configured")
}

/// Thin helpers over supabase-swift that decode with the app's own
/// decoder, so every model reads snake_case columns and Postgres
/// timestamps the same way.
enum API {
    static func client() throws -> SupabaseClient {
        guard let client = SupabaseService.client else { throw APIError.notConfigured }
        return client
    }

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let text = try container.decode(String.self)
            if let date = PostgresDate.parse(text) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unreadable date: \(text)")
        }
        return decoder
    }()

    /// Calls an RPC and decodes its result.
    static func rpc<T: Decodable>(_ name: String, _ params: [String: AnyJSON] = [:], as type: T.Type = T.self) async throws -> T {
        do {
            let response = try await client().rpc(name, params: params).execute()
            return try decoder.decode(T.self, from: response.data)
        } catch {
            throw translate(error)
        }
    }

    /// Calls an RPC whose result is not needed.
    static func rpcVoid(_ name: String, _ params: [String: AnyJSON] = [:]) async throws {
        do {
            _ = try await client().rpc(name, params: params).execute()
        } catch {
            throw translate(error)
        }
    }

    /// Runs a table query built by `build` and decodes the rows.
    static func rows<T: Decodable>(_ type: T.Type, _ build: (SupabaseClient) throws -> PostgrestBuilder) async throws -> [T] {
        do {
            let response = try await build(client()).execute()
            return try decoder.decode([T].self, from: response.data)
        } catch {
            throw translate(error)
        }
    }

    /// Turns a PostgREST error into the message the database raised.
    static func translate(_ error: Error) -> Error {
        if let error = error as? APIError { return error }
        if let error = error as? PostgrestError {
            return APIError(message: error.message, hint: error.hint)
        }
        if let error = error as? URLError {
            return APIError(message: "Geen verbinding met Snatzee. Controleer je internet.", hint: "offline_\(error.code.rawValue)")
        }
        return error
    }
}

/// Postgres timestamps as PostgREST writes them: ISO 8601 with a numeric
/// offset and zero to six fractional digits.
enum PostgresDate {
    private static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func parse(_ text: String) -> Date? {
        if let date = withFraction.date(from: text) ?? plain.date(from: text) { return date }
        // More than three fractional digits: trim to milliseconds.
        guard let dot = text.firstIndex(of: "."),
              let zone = text[dot...].firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" })
        else { return nil }
        let fraction = text[text.index(after: dot)..<zone].prefix(3)
        return withFraction.date(from: "\(text[..<dot]).\(fraction)\(text[zone...])")
    }

    static func string(_ date: Date) -> String {
        withFraction.string(from: date)
    }
}
