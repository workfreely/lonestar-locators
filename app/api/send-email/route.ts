import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { to, subject, html } = await req.json();

    // your email logic here

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
