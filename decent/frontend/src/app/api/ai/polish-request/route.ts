import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // 3 minutes for local LLM reasoning & response

export async function POST(req: NextRequest) {
  try {
    const { message, category, subject } = await req.json();
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    const aiBaseUrl = process.env.AI_BASE_URL || 'https://glm.idaraalkhair.sbs';
    const aiApiKey = process.env.AI_API_KEY || 'e5d563b9bef82a8a2d5442c1d038c876ba7bc4f52c2a2a4e8f64db72df66b1d1';
    const aiModel = process.env.AI_MODEL_NAME || 'glm-4.7-flash';

    const systemPrompt = `You are an expert HR communication assistant for an enterprise HRMS.
An employee is writing an official formal request to the HR / Administration department.
The employee's draft may be in Urdu, Roman Urdu, informal English, or rough notes.

Instructions:
1. Translate Urdu/Roman Urdu accurately into fluent, professional formal English.
2. Rewrite into a polite, respectful, and crystal-clear business email format suitable for HR records.
3. If an appropriate Subject line is missing or weak, generate a concise, professional Subject line.
4. Maintain all specific dates, figures, names, or reference numbers mentioned.
5. Keep internal reasoning concise and directly produce the final JSON.
6. Return strictly a valid JSON object matching this schema with no markdown wrapping outside the JSON:
{
  "subject": "Concise Subject Line",
  "message": "Dear HR Team,\\n\\n[Polished formal request body]\\n\\nSincerely,\\n[Employee]"
}`;

    const userPrompt = `Category: ${category || 'General'}\nCurrent Subject: ${subject || '(none)'}\nEmployee Draft Message:\n"""\n${message}\n"""`;

    // Ensure proper URL structure
    const targetUrl = aiBaseUrl.endsWith('/v1') 
      ? `${aiBaseUrl}/chat/completions` 
      : `${aiBaseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiApiKey}`,
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        stream: true,
      }),
      signal: AbortSignal.timeout(180000), // 3 min timeout
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `AI service error (${response.status}): ${errText || response.statusText}` },
        { status: 502 }
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '').trim();
        if (dataStr === '[DONE]') continue;
        try {
          const parsedChunk = JSON.parse(dataStr);
          const deltaContent = parsedChunk.choices?.[0]?.delta?.content || '';
          accumulatedContent += deltaContent;
        } catch {
          // Ignore partial or non-json chunk
        }
      }
    }

    const content = accumulatedContent.trim();
    let parsed: { subject?: string; message?: string } = {};
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { message: content };
    }

    return NextResponse.json({
      subject: parsed.subject || subject || '',
      message: parsed.message || content,
    });
  } catch (error: any) {
    console.error('AI Polish Route Error:', error);
    const aiBaseUrl = process.env.AI_BASE_URL || 'https://glm.idaraalkhair.sbs';
    let msg = `AI server (${aiBaseUrl}) unreachable hai.`;
    if (error.name === 'TimeoutError' || error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      msg = `AI server (${aiBaseUrl}) timed out. Check karein ke tunnel aur AI model server chal rahe hain.`;
    } else if (error?.cause?.code === 'ECONNREFUSED') {
      msg = `AI server (${aiBaseUrl}) connection refused. Check karein ke GLM model service chal rahi hai.`;
    } else if (error?.message) {
      msg = `AI server error: ${error.message} (${aiBaseUrl})`;
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
