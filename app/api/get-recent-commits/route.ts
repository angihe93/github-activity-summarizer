import { NextRequest, NextResponse } from 'next/server';
import Exa from "exa-js";
import { ZRecentCommitsResponse } from '@/app/types/types';

const exa = new Exa(process.env.EXA_API_KEY);

const summaryOutputSchema = {
  description: "Schema describing a summary of recent commits to a repository",
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "summary of most recent commits, feel free to elaborate on the bigger picture beyond just listing the individual commit messages"
    },
    repository: {
      type: "object",
      description: "Information about the repository",
      properties: {
        name: {
          type: "string",
          description: "Name of the repository, do not include the owner/org name, only a single string for the repo name"
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
    const { commitsUrl } = await req.json();
    if (!commitsUrl) {
      return NextResponse.json({ error: 'Github repo commits URL is required' }, { status: 400 });
    }
    let attempts = 0;
    let validation = ZRecentCommitsResponse.safeParse(null);
    let resultJson;
    while (attempts < 2) {
      const result = await exa.getContents([commitsUrl], {
        type: "auto",
        livecrawl: "always",
        livecrawlTimeout: 10000,
        summary: {
          query: `summarize the recent commits (within last 30 days, ignore those older than 30 days) to this repo ${commitsUrl}`,
          schema: summaryOutputSchema
        },
      });
      resultJson = JSON.parse(result.results?.[0]?.summary || '{}');
      console.log('get-recent-commits result JSON:', resultJson);
      validation = ZRecentCommitsResponse.safeParse(resultJson);
      if (validation.success) break;
      attempts++;
      console.log(`Retrying get-recent-commits for ${commitsUrl} attempt ${attempts}`);
    }
    if (!validation.success) {
      // try without schema
      const result = await exa.getContents([commitsUrl], {
        type: "auto",
        livecrawl: "always",
        livecrawlTimeout: 10000,
        summary: {
          query: `summarize the recent commits (within last 30 days, ignore those older than 30 days) to this repo ${commitsUrl}`,
        },
      });
      const match = commitsUrl.match(/github\.com\/[^\/]+\/([^\/]+)/);
      const repoName = match ? match[1] : '';
      resultJson = {
        repository: { name: repoName, url: commitsUrl.split('/commits')[0] },
        summary: result.results?.[0]?.summary || ''
      };
      console.log('get-recent-commits no schema result JSON:', resultJson);
      return NextResponse.json({ result: resultJson });
    }
    return NextResponse.json({ result: resultJson });
  } catch (error) {
    return NextResponse.json({ error: `Failed to perform getContents for api/get-recent-commits | ${error}` }, { status: 500 });
  }
}
