import { NextResponse } from "next/server";

export async function GET() {
  const html = `
  <div style="font-family: Inter, sans-serif; padding:40px;">
    <h1>Welcome to Lone Star Locators</h1>
    <p>This is what your renter email will look like.</p>
  </div>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
