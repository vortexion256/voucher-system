// app/api/users/route.js
import { db } from "../../lib/firebase.js";
import { collection, doc, setDoc, getDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Create a new user/tenant
export async function POST(request) {
  try {
    const { email, name, slug, marzApiKey, marzApiSecret } = await request.json();

    if (!email || !name || !slug) {
      return Response.json(
        { success: false, message: "Email, name, and slug are required" },
        { status: 400 }
      );
    }

    // Validate slug format (alphanumeric and hyphens only)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      return Response.json(
        { success: false, message: "Slug must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const slugQuery = query(collection(db, "users"), where("slug", "==", slug));
    const slugSnapshot = await getDocs(slugQuery);
    if (!slugSnapshot.empty) {
      return Response.json(
        { success: false, message: "Slug already exists. Please choose another." },
        { status: 400 }
      );
    }

    // Check if email already exists
    const emailQuery = query(collection(db, "users"), where("email", "==", email));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      return Response.json(
        { success: false, message: "Email already registered" },
        { status: 400 }
      );
    }

    // Generate base64 auth if credentials provided
    let marzBase64Auth = null;
    if (marzApiKey && marzApiSecret) {
      marzBase64Auth = Buffer.from(`${marzApiKey}:${marzApiSecret}`).toString("base64");
    }

    const userId = uuidv4();
    const userDoc = doc(collection(db, "users"), userId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    await setDoc(userDoc, {
      email,
      name,
      slug,
      marzApiKey: marzApiKey || null,
      marzApiSecret: marzApiSecret || null,
      marzBase64Auth: marzBase64Auth,
      active: true,
      createdAt: serverTimestamp(),
      embedUrl: `${baseUrl}/embed/${slug}`,
    });

    return Response.json({
      success: true,
      data: {
        userId,
        slug,
        embedUrl: `${baseUrl}/embed/${slug}`,
      },
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// Get user by slug or userId (for embeddable pages and internal use)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const userId = searchParams.get("userId");
    const email = searchParams.get("email");

    if (slug) {
      const slugQuery = query(collection(db, "users"), where("slug", "==", slug));
      const snapshot = await getDocs(slugQuery);
      
      if (snapshot.empty) {
        return Response.json(
          { success: false, message: "User not found" },
          { status: 404 }
        );
      }

      const userData = snapshot.docs[0].data();
      // Don't return sensitive data for public lookups
      return Response.json({
        success: true,
        data: {
          userId: snapshot.docs[0].id,
          name: userData.name,
          slug: userData.slug,
          embedUrl: userData.embedUrl,
          active: userData.active,
        },
      });
    }

    if (userId) {
      const userDoc = doc(collection(db, "users"), userId);
      const snapshot = await getDoc(userDoc);
      
      if (!snapshot.exists()) {
        return Response.json(
          { success: false, message: "User not found" },
          { status: 404 }
        );
      }

      const userData = snapshot.data();
      return Response.json({
        success: true,
        data: {
          userId: snapshot.id,
          email: userData.email,
          name: userData.name,
          slug: userData.slug,
          embedUrl: userData.embedUrl,
          active: userData.active,
          hasCredentials: !!userData.marzBase64Auth,
          createdAt: userData.createdAt,
        },
      });
    }

    if (email) {
      const emailQuery = query(collection(db, "users"), where("email", "==", email));
      const snapshot = await getDocs(emailQuery);
      
      if (snapshot.empty) {
        return Response.json(
          { success: false, message: "User not found" },
          { status: 404 }
        );
      }

      const userData = snapshot.docs[0].data();
      return Response.json({
        success: true,
        data: {
          userId: snapshot.docs[0].id,
          email: userData.email,
          name: userData.name,
          slug: userData.slug,
          embedUrl: userData.embedUrl,
          active: userData.active,
          hasCredentials: !!userData.marzBase64Auth,
        },
      });
    }

    return Response.json(
      { success: false, message: "slug, userId, or email required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error fetching user:", error);
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
