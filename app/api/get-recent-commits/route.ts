import { NextRequest, NextResponse } from 'next/server';
import Exa from "exa-js";
import { ZGetRecentCommitsResponse } from '@/app/types/types';

const exa = new Exa(process.env.EXA_API_KEY);

const summaryOutputSchema = {
  description: "Schema describing a summary of recent commits to a repository",
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "summary of most recent commits"
    },
    repository: {
      type: "object",
      description: "Information about the repository",
      properties: {
        name: {
          type: "string",
          description: "Name of the repository"
        },
        url: {
          type: "string",
          description: "URL of the repository"
        }
      },
      required: ["name", "url"],
      additionalProperties: false
    },
    commits: {
      type: "array",
      description: "List of recent commits",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Commit hash"
          },
          url: {
            type: "string",
            description: "URL to the commit"
          },
          author: {
            type: "string",
            description: "Name of the commit author"
          },
          date: {
            type: "string",
            description: "Date and time of the commit"
          },
          message: {
            type: "string",
            description: "Commit message"
          },
        },
        required: ["id", "url", "author", "date", "message"],
        additionalProperties: false
      }
    },
  },
  required: ["repository", "commits", "summary"],
  additionalProperties: false
};

export async function POST(req: NextRequest) {
  try {
    // example url format: https://github.com/openai/codex
    const { repoUrl } = await req.json();
    if (!repoUrl) {
      return NextResponse.json({ error: 'Github repo URL is required' }, { status: 400 });
    }
    const commitsUrl = `${repoUrl}/commits/main/`;
    const result = await exa.getContents([commitsUrl], {
      type: "auto",
      livecrawl: "always",
      livecrawlTimeout: 10000,
      summary: {
        query: `summarize the recent commits to this repo ${commitsUrl}`,
        schema: summaryOutputSchema
      },
    });
    const resultJson = JSON.parse(result.results?.[0]?.summary || '{}');
    const validation = ZGetRecentCommitsResponse.safeParse(resultJson);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid response format", details: validation.error }, { status: 500 });
    }
    return NextResponse.json({ result: resultJson });
  } catch (error) {
    return NextResponse.json({ error: `Failed to perform getContents for api/get-recent-commits | ${error}` }, { status: 500 });
  }
}
