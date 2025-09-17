import { NextRequest, NextResponse } from 'next/server';
import Exa from "exa-js";
import { ZFindRecentReposResponse } from '@/app/types/types';

const exa = new Exa(process.env.EXA_API_KEY);

const summaryOutputSchema = {
  description: "Schema describing recently updated repositories",
  type: "object",
  properties: {
    repositories: {
      type: "array",
      description: "List of recently updated repositories",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the repository"
          },
          owner: {
            type: "string",
            description: "Owner or organization of the repository"
          },
          lastUpdated: {
            type: "string",
            description: "Date and time of the last update"
          },
          description: {
            type: "string",
            description: "Description of the repository"
          },
          url: {
            type: "string",
            description: "URL to the repository"
          },
          stars: {
            type: "integer",
            description: "Number of stars the repository has"
          },
          language: {
            type: "string",
            description: "Primary programming language used in the repository"
          }
        },
        required: ["name", "url", "lastUpdated"],
        additionalProperties: false
      }
    }
  },
  required: ["repositories"],
  additionalProperties: false
};

export async function POST(req: NextRequest) {
  try {
    // example url format: https://github.com/orgs/openai
    const { githubOrgUrl } = await req.json();
    if (!githubOrgUrl) {
      return NextResponse.json({ error: 'Github org URL is required' }, { status: 400 });
    }
    const repoUrl = `${githubOrgUrl}/repositories?type=all`;
    const result = await exa.getContents([repoUrl], {
      type: "auto",
      livecrawl: "always",
      livecrawlTimeout: 10000,
      summary: {
        query: `summarize the recently updated repos (within last week and this week) at ${repoUrl}`,
        schema: summaryOutputSchema
      }
    });
    const resultJson = JSON.parse(result.results?.[0]?.summary || '{}');
    const validation = ZFindRecentReposResponse.safeParse(resultJson);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid response format", details: validation.error }, { status: 500 });
    }
    return NextResponse.json({ result: resultJson });
  } catch (error) {
    return NextResponse.json({ error: `Failed to perform getContents for api/find-recent-repos | ${error}` }, { status: 500 });
  }
}