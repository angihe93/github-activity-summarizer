"use client";

import { DefaultBranchResponse, RecentCommitsResponse, RecentReposResponse, Repository, Commit } from "@/app/types/types";
import React, { useEffect } from "react";
import { motion } from "framer-motion";

type RepositoryWithCommitsUrl = Repository & { commitsUrl?: string };

type CommitsWithSummary = { commits: Commit[], summary: string };

type RepoCommits = {
  [repoName: string]: { repo: RepositoryWithCommitsUrl; commitsWithSummary: CommitsWithSummary }
}

export default function GithubActivitySummary() {

  const [companyUrl, setCompanyUrl] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [showInvalid, setShowInvalid] = React.useState(false);
  const [recentRepos, setRecentRepos] = React.useState<Repository[] | null>(null);
  const [totalReposCount, setTotalReposCount] = React.useState<number | null>(null);
  const [repoCommits, setRepoCommits] = React.useState<RepoCommits | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isValidUrl = (url: string): boolean => {
    url = url.trim();
    const regex = /^(https?:\/\/)?github\.com\/(orgs\/)?[a-zA-Z0-9-]+$/;
    return regex.test(url);
  };

  const normalizeGithubOrgUrl = (url: string): string => {
    url = url.trim();
    if (!url.startsWith('https://')) {
      url = 'https://' + url;
    }
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
      setError(`Unable to get recent repos for ${companyUrl}, please check the URL is correct and try again.`);
      return { result: { repositories: [] } };
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
    console.log('Normalized URL:', normalizedUrl);
    try {
      const reposResponse = await findRecentRepos(normalizedUrl);
      if (reposResponse.result.repositories.length === 0) {
        return;
      }
      console.log('Recent Repos Response:', reposResponse);
      const validRepoUrlRegex = /^https:\/\/github\.com\/[^\/]+\/[^\/]+$/;
      const validRepos: RepositoryWithCommitsUrl[] = reposResponse.result.repositories.filter(repo => validRepoUrlRegex.test(repo.url));
      setRecentRepos(validRepos);

      const defaultBranchPromises = validRepos.map(repo => getDefaultBranch(repo.url));
      const defaultBranchResponses = await Promise.allSettled(defaultBranchPromises);
      const successfulDefaultBranches = defaultBranchResponses
        .filter((r): r is PromiseFulfilledResult<{ result: DefaultBranchResponse }> => r.status === 'fulfilled')
        .map(r => r.value);
      console.log('Successful Default Branch Responses:', successfulDefaultBranches);
      // console.log('Default Branch Responses:', defaultBranchResponses);
      const repoCommitsLinks = successfulDefaultBranches.map((res, idx) => {
        return `${validRepos[idx].url}/commits/${res.result.defaultBranch}`;
      });
      successfulDefaultBranches.forEach(branchRes => {
        const repo = validRepos.find(r => r.name === branchRes.result.repositoryName);
        if (repo) {
          repo.commitsUrl = `${repo.url}/commits/${branchRes.result.defaultBranch}`;
        }
      });
      setStatus(`Fetching and summarizing commits for ${repoCommitsLinks.length} recent repositories...`);
      setTotalReposCount(repoCommitsLinks.length);
      console.log('Repo Commits Links:', repoCommitsLinks);
      console.log('Valid Repos with Commits URL:', validRepos);

      const commitPromises = repoCommitsLinks.map(async (url) => {
        try {
          const commitsRes = await getRecentCommits(url);
          const repo = validRepos.find(r => r.name === commitsRes.result.repository.name)
          if (repo) {
            setRepoCommits(prev => ({
              ...prev,
              [repo.name]: {
                repo,
                commitsWithSummary: {
                  commits: commitsRes.result.commits ?? [],
                  summary: commitsRes.result.summary
                }
              }
            }));
          }
        } catch (error) {
          console.log(`Failed to get commits for ${url}:`, error);
        }
      });
      await Promise.allSettled(commitPromises);

    } catch (error) {
      console.error('Error during research:', error);
    }
    finally {
      setIsGenerating(false);
      console.log("final repoCommits:", repoCommits);
    }
  }

  useEffect(() => {
    if (!recentRepos || !repoCommits || !totalReposCount) return;
    const newReposOrder = recentRepos.slice().sort((a, b) => {
      const aHasCommits = repoCommits && repoCommits[a.name] && repoCommits[a.name].commitsWithSummary.commits.length > 0 ? 0 : 2;
      const bHasCommits = repoCommits && repoCommits[b.name] && repoCommits[b.name].commitsWithSummary.commits.length > 0 ? 0 : 2;
      let aScore = aHasCommits;
      let bScore = bHasCommits;
      if (aHasCommits === 2) {
        if (repoCommits && repoCommits[a.name] && repoCommits[a.name].commitsWithSummary.summary.length > 0 && !repoCommits[a.name].commitsWithSummary.summary.toLowerCase().startsWith('no'))
          aScore = 1;
      }
      if (bHasCommits === 2) {
        if (repoCommits && repoCommits[b.name] && repoCommits[b.name].commitsWithSummary.summary.length > 0 && !repoCommits[b.name].commitsWithSummary.summary.toLowerCase().startsWith('no'))
          bScore = 1;
      }
      return aScore - bScore;
    })
    setRecentRepos(newReposOrder);
    const summarizedCount = Object.keys(repoCommits).length;
    setStatus(summarizedCount < totalReposCount && isGenerating
      ? `Summarized commits for ${summarizedCount}/${totalReposCount} repositories. ${totalReposCount - summarizedCount} remaining...`
      : `Summarized commits for ${summarizedCount} repositories.`);
  }, [repoCommits]);

  useEffect(() => {
    console.log('recentRepos updated:', recentRepos);
    console.log('repoCommits state:', repoCommits);
  }, [recentRepos])

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
            setError(null);
            setCompanyUrl(val);
            setShowInvalid(val.length > 0 && !isValidUrl(val));
          }}
          placeholder="Enter organization's GitHub URL (e.g., github.com/exa-labs or github.com/orgs/exa-labs)"
          className="w-full"
        />
        {showInvalid && (
          <div className="text-red-500 mt-2">
            Please enter a valid GitHub organization URL, e.g., github.com/exa-labs or github.com/orgs/exa-labs
          </div>
        )}
        <button
          type="submit"
          disabled={isGenerating}
        >
          {isGenerating ? 'Summarizing...' : 'Summarize Now'}
        </button>
      </form>

      {status && (
        <div className="mt-2">
          {status}
        </div>
      )}

      {error && (
        <div className="text-red-500 mt-2">
          {error}
        </div>
      )}

      {recentRepos && recentRepos.length > 0 && (
        recentRepos
          .map(repo => (
            <motion.div
              key={repo.name}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="border p-4 px-6 my-2 h-70 bg-white overflow-y-auto"
            >
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
                      <div className="mt-2">
                        <h3 className="font-semibold">Recent Commits:</h3>
                        <p>{repoCommits[repo.name].commitsWithSummary.summary}</p>
                        {repoCommits[repo.name].commitsWithSummary.commits.map(commit => (
                          <div key={commit.id} className="border-t mt-2 pt-2">
                            <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-blue-600">{commit.message}</a>
                            <p>Author: {commit.author} | Date: {new Date(commit.date).toLocaleString()}</p>
                          </div>
                        ))}
                        {repoCommits[repo.name].commitsWithSummary.commits.length === 0 && repoCommits[repo.name].repo.commitsUrl && (
                          <div className="mt-2">
                            <a href={repoCommits[repo.name].repo.commitsUrl} className="text-blue-600">View commits here</a>
                          </div>
                        )}
                      </div>
                    )
                    // : <div>Loading...</div>}
                    : (isGenerating ? <div>Loading...</div> : <div>failed to get commits details</div>)}
                </div>
              </div>
            </motion.div>
          ))
      )}
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

    </div>
  )
}