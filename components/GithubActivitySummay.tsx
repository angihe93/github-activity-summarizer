"use client";

import { DefaultBranchResponse, RecentCommitsResponse, RecentReposResponse, Repository, Commit } from "@/app/types/types";
import React from "react";

type CommitsWithSummary = { commits: Commit[], summary: string };


type RepoCommits = {
  [repoName: string]: { repo: Repository; commitsWithSummary: CommitsWithSummary }
}

export default function GithubActivitySummary() {

  const [companyUrl, setCompanyUrl] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [showInvalid, setShowInvalid] = React.useState(false);
  const [recentRepos, setRecentRepos] = React.useState<Repository[] | null>(null);
  const [recentCommits, setRecentCommits] = React.useState<RecentCommitsResponse[] | null>(null);
  const [repoCommits, setRepoCommits] = React.useState<RepoCommits | null>(null);

  const isValidUrl = (url: string): boolean => {
    try {
      url = url.trim();
      if (!url.includes('.')) {
        return false;
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      const urlObj = new URL(url);
      return urlObj.hostname.includes('.') && !urlObj.hostname.includes(' ');
    } catch {
      return false;
    }
  };

  const normalizeGithubOrgUrl = (url: string): string => {
    if (url.includes('/orgs/')) {
      return url;
    }
    const match = url.match(/^https:\/\/github\.com\/([^\/]+)$/);
    if (match) {
      return `https://github.com/orgs/${match[1]}`;
    }
    return url;
  }

  const findRecentRepos = async (githubOrgUrl: string): Promise<{ result: RecentReposResponse }> => {
    const response = await fetch('/api/find-recent-repos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ githubOrgUrl })
    });
    if (!response.ok) {
      throw new Error(`Error fetching recent repos: ${response.statusText}`);
    }
    return response.json();
  }

  // TODO: get default branch
  const getDefaultBranch = async (repoUrl: string): Promise<{ result: DefaultBranchResponse }> => {
    const response = await fetch('/api/get-repo-default-branch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ repoUrl })
    });
    if (!response.ok) {
      throw new Error(`Error fetching default branch: ${response.statusText}`);
    }
    return response.json();
  }

  const getRecentCommits = async (commitsUrl: string): Promise<{ result: RecentCommitsResponse }> => {
    const response = await fetch('/api/get-recent-commits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ commitsUrl })
    });
    if (!response.ok) {
      throw new Error(`Error fetching recent commits: ${response.statusText}`);
    }
    return response.json();
  }

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl(companyUrl)) {
      setShowInvalid(true);
      return;
    }
    setShowInvalid(false);
    setIsGenerating(true);
    const normalizedUrl = normalizeGithubOrgUrl(companyUrl);
    try {
      const reposResponse = await findRecentRepos(normalizedUrl);
      console.log('Recent Repos Response:', reposResponse);
      // only setrecentrepos if url is valid
      const validRepoUrlRegex = /^https:\/\/github\.com\/[^\/]+\/[^\/]+$/;
      const validRepos: Repository[] = reposResponse.result.repositories.filter(repo => validRepoUrlRegex.test(repo.url));
      setRecentRepos(validRepos);

      const defaultBranchPromises = validRepos.map(repo => getDefaultBranch(repo.url));
      const defaultBranchResponses = await Promise.all(defaultBranchPromises);
      // console.log('Default Branch Responses:', defaultBranchResponses);
      const repoCommitsLinks = defaultBranchResponses.map((res, idx) => {
        return `${validRepos[idx].url}/commits/${res.result.defaultBranch}`;
      });
      console.log('Repo Commits Links:', repoCommitsLinks);

      const commitsPromises = repoCommitsLinks.map(url => getRecentCommits(url));
      // these might fail due to schema validation failure, so get successful ones only
      const commitsResults = await Promise.allSettled(commitsPromises);
      const successfulCommits = commitsResults
        .filter((r): r is PromiseFulfilledResult<{ result: RecentCommitsResponse }> => r.status === 'fulfilled')
        .map(r => r.value.result);
      console.log('Successful Commits Responses:', successfulCommits);

      const repoCommitsMap: RepoCommits = {};
      successfulCommits.forEach(commitRes => {
        repoCommitsMap[commitRes.repository.name] = { repo: validRepos.find(r => r.name === commitRes.repository.name)!, commitsWithSummary: { commits: commitRes.commits, summary: commitRes.summary } };
      });
      const validSuccessfulRepos = reposResponse.result.repositories.filter(repo =>
        successfulCommits.some(commitRes => commitRes.repository.name === repo.name)
      );
      // setRecentRepos(validSuccessfulRepos);
      // setRecentCommits(successfulCommits);
      setRepoCommits(repoCommitsMap);


    } catch (error) {
      console.error('Error during research:', error);
    }
    finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <div>GitHub Activity Summary</div>
      <p>
        Get the recent activitities of an organization on GitHub with a summary of their latest commits.
        Gain real-time insights into what the company is building.
      </p>
      <form onSubmit={handleResearch}>
        <input
          value={companyUrl}
          onChange={(e) => {
            const val = e.target.value;
            setCompanyUrl(val);
            setShowInvalid(val.length > 0 && !isValidUrl(val));
          }}
          placeholder="Enter organization's GitHub URL (e.g., https://github.com/exa-labs or https://github.com/orgs/exa-labs)"
          className="w-full"
        />
        {showInvalid && (
          <div className="text-red-500 mt-2">
            Please enter a valid GitHub organization URL
          </div>
        )}
        <button
          type="submit"
          disabled={isGenerating}
        >
          {isGenerating ? 'Summarizing...' : 'Summarize Now'}
        </button>
        {recentRepos && recentRepos.length > 0 && (
          recentRepos
            .slice()
            .sort((a, b) => {
              const aHasCommits = repoCommits && repoCommits[a.name] ? 0 : 1;
              const bHasCommits = repoCommits && repoCommits[b.name] ? 0 : 1;
              return aHasCommits - bHasCommits;
            })
            .map(repo => (
              <div key={repo.name} className="border p-4 px-6 my-2 h-70 overflow-y-auto">
                <div className="flex space-x-4">
                  <div className="min-w-[300px] max-w-[300px]">
                    <a href={repo.url} target="_blank" rel="noopener noreferrer" className="text-xl font-bold text-blue-600">{repo.name}</a>
                    <p>{repo.description}</p>
                    <p>Last Updated: {new Date(repo.lastUpdated).toLocaleDateString()}</p>
                    <p>Stars: {repo.stars || 0} | Language: {repo.language || 'N/A'}</p>
                  </div>
                  <div>
                    {repoCommits && repoCommits[repo.name] ?
                      (
                        //     <div key={repo.name} className="border p-4 my-2">
                        // <a href={repo.url} target="_blank" rel="noopener noreferrer" className="text-xl font-bold text-blue-600">{repo.name}</a>
                        // <p>{repo.description}</p>
                        // <p>Last Updated: {new Date(repo.lastUpdated).toLocaleDateString()}</p>
                        // <p>Stars: {repo.stars || 0} | Language: {repo.language || 'N/A'}</p>
                        <div className="mt-2">
                          <h3 className="font-semibold">Recent Commits:</h3>
                          <p>{repoCommits[repo.name].commitsWithSummary.summary}</p>
                          {repoCommits[repo.name].commitsWithSummary.commits.map(commit => (
                            <div key={commit.id} className="border-t mt-2 pt-2">
                              <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-blue-600">{commit.message}</a>
                              <p>Author: {commit.author} | Date: {new Date(commit.date).toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                        // </div>
                      )
                      : (<div>failed to get commits details</div>)}
                  </div>
                </div>
              </div>))
        )}
        {/* {repoCommits && Object.keys(repoCommits).length > 0 && (
          Object.entries(repoCommits).map(([repoName, { repo, commitsWithSummary }]) => (
            <div key={repoName} className="border p-4 my-2">
              <a href={repo.url} target="_blank" rel="noopener noreferrer" className="text-xl font-bold text-blue-600">{repo.name}</a>
              <p>{repo.description}</p>
              <p>Last Updated: {new Date(repo.lastUpdated).toLocaleDateString()}</p>
              <p>Stars: {repo.stars || 0} | Language: {repo.language || 'N/A'}</p>
              <div className="mt-2">
                <h3 className="font-semibold">Recent Commits:</h3>
                <p>{commitsWithSummary.summary}</p>
                {commitsWithSummary.commits.map(commit => (
                  <div key={commit.id} className="border-t mt-2 pt-2">
                    <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-blue-600">{commit.message}</a>
                    <p>Author: {commit.author} | Date: {new Date(commit.date).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          ))
        )} */}
        {/* <main className="row-start-2 flex flex-col items-center justify-center">
        <div>
          <span>Powered by</span>
          {/* <a
            href="https://exa.ai"
            target="_blank"
            rel="origin"
          >
            <img src="/exa_logo.png" alt="Exa Logo" />
          </a> */}
        {/* </div> */}
      </form>
    </div>
  )
}