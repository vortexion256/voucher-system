// app/api/test-marz-credentials/route.js - Test Marz Pay credentials
import axios from "axios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { marzApiKey, marzApiSecret, userId } = await request.json();

    let AUTH;
    let testMessage = "";

    if (userId) {
      // Fetch user's credentials
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      try {
        const userResponse = await fetch(`${baseUrl}/api/users/${userId}/credentials`, {
          method: "GET",
        });
        const userData = await userResponse.json();

        if (!userData.success || !userData.data.marzBase64Auth) {
          return Response.json({
            success: false,
            message: "User credentials not configured",
            hasCredentials: false,
          });
        }

        AUTH = userData.data.marzBase64Auth;
        testMessage = "Testing stored credentials";
      } catch (error) {
        return Response.json({
          success: false,
          message: "Failed to fetch user credentials",
          error: error.message,
        });
      }
    } else if (marzApiKey && marzApiSecret) {
      // Test provided credentials
      AUTH = Buffer.from(`${marzApiKey.trim()}:${marzApiSecret.trim()}`).toString("base64");
      testMessage = "Testing provided credentials";
    } else {
      return Response.json({
        success: false,
        message: "Either userId or marzApiKey+marzApiSecret required",
      });
    }

    if (!AUTH) {
      return Response.json({
        success: false,
        message: "No credentials to test",
      });
    }

    // Test credentials by calling a simple Marz Pay endpoint
    const apiUrl = process.env.MARZ_API_BASE_URL || "https://wallet.wearemarz.com/api/v1";
    
    try {
      // Try to get account info or services (a simple GET request)
      const response = await axios.get(
        `${apiUrl}/collect-money/services`,
        {
          headers: {
            Authorization: `Basic ${AUTH}`,
          },
          timeout: 10000,
        }
      );

      return Response.json({
        success: true,
        message: "Credentials are valid!",
        testMessage,
        status: response.status,
        data: response.data,
      });
    } catch (error) {
      const statusCode = error.response?.status;
      const errorData = error.response?.data;
      
      let message = "Credentials test failed";
      let isValid = false;

      if (statusCode === 401) {
        message = "Invalid credentials - API Key or Secret is incorrect";
      } else if (statusCode === 403) {
        message = "Credentials are valid but access is forbidden (check account permissions)";
        isValid = true; // Credentials are correct, just no permission
      } else if (statusCode === 404) {
        message = "Endpoint not found (credentials might be valid but endpoint changed)";
      } else if (statusCode >= 500) {
        message = "Marz Pay server error (credentials might be valid)";
      } else {
        message = errorData?.message || error.message || "Unknown error";
      }

      return Response.json({
        success: isValid,
        message,
        statusCode,
        error: errorData || error.message,
        testMessage,
      });
    }
  } catch (error) {
    console.error("Test credentials error:", error);
    return Response.json({
      success: false,
      message: "Failed to test credentials",
      error: error.message,
    });
  }
}

export async function GET() {
  return Response.json({
    message: "Test Marz Pay credentials",
    usage: "POST with { userId: 'user-id' } or { marzApiKey: 'key', marzApiSecret: 'secret' }",
  });
}
