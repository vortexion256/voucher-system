// app/api/users/[userId]/credentials/route.js
import { db } from "../../../../lib/firebase.js";
import { doc, getDoc, updateDoc, collection, serverTimestamp } from "firebase/firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Update user's Marz API credentials
export async function PUT(request, { params }) {
  try {
    const { userId } = params;
    const { marzApiKey, marzApiSecret } = await request.json();

    if (!marzApiKey || !marzApiSecret) {
      return Response.json(
        { success: false, message: "API key and secret are required" },
        { status: 400 }
      );
    }

    const userDoc = doc(collection(db, "users"), userId);
    const snapshot = await getDoc(userDoc);

    if (!snapshot.exists()) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Trim whitespace and generate base64 auth
    const trimmedKey = marzApiKey.trim();
    const trimmedSecret = marzApiSecret.trim();
    
    if (!trimmedKey || !trimmedSecret) {
      return Response.json(
        { success: false, message: "API key and secret cannot be empty" },
        { status: 400 }
      );
    }
    
    // Generate base64 auth
    const marzBase64Auth = Buffer.from(`${trimmedKey}:${trimmedSecret}`).toString("base64");

    await updateDoc(userDoc, {
      marzApiKey: trimmedKey,
      marzApiSecret: trimmedSecret,
      marzBase64Auth,
      updatedAt: serverTimestamp(),
    });

    return Response.json({
      success: true,
      message: "Credentials updated successfully",
    });
  } catch (error) {
    console.error("Error updating credentials:", error);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// Get user credentials (for internal API use only - used by payment routes)
export async function GET(request, { params }) {
  try {
    const { userId } = params;
    const userDoc = doc(collection(db, "users"), userId);
    const snapshot = await getDoc(userDoc);

    if (!snapshot.exists()) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const userData = snapshot.data();
    
    if (!userData.active) {
      return Response.json(
        { success: false, message: "User account is inactive" },
        { status: 403 }
      );
    }

    return Response.json({
      success: true,
      data: {
        userId: snapshot.id,
        marzApiKey: userData.marzApiKey,
        marzBase64Auth: userData.marzBase64Auth,
        hasCredentials: !!userData.marzBase64Auth,
      },
    });
  } catch (error) {
    console.error("Error fetching credentials:", error);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
